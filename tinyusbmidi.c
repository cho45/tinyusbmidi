#include <stdlib.h>
#include <stdio.h>
#include <string.h>

#include "bsp/board.h"
#include "tusb.h"
#include "hardware/gpio.h"
#include "hardware/flash.h" 
#include "pico/flash.h"
#include "hardware/sync.h"

// === 設定定数 ===
#define MAX_SWITCHES 16              // 最大スイッチ数（GPIOの数に応じて調整可能）
#define MAX_MESSAGES_PER_EVENT 10    // 各イベントあたりの最大メッセージ数

// === メモリ使用量の計算 ===
// 各MIDIメッセージ: 4バイト (msg_type, channel, param1, param2)
// 各イベント: 1バイト (message_count) + 10 * 4バイト (messages) = 41バイト
// 各スイッチ: 2イベント * 41バイト = 82バイト
// 16スイッチの場合: 16 * 82 = 1,312バイト
// ヘッダ/フッタ: magic(4) + num_switches(1) + checksum(4) = 9バイト
// 合計: 1,321バイト（RP2040のRAM 264KB、Flash 2MBに対して十分小さい）

// ピン番号の配列（実際に使用するピンを定義）
static const uint8_t switch_pins[] = {2, 3};  // GPIO2, GPIO3 switch
static const uint8_t num_switches = sizeof(switch_pins) / sizeof(switch_pins[0]);

#define DEBOUNCE_TIME_MS 20
#define MIDI_CABLE_NUM 0
#define SYSEX_BUFFER_SIZE 64
#define SYSEX_MIN_LENGTH 11

#define FLASH_TARGET_OFFSET (256 * 1024)

// LED control constants
#define LED_PIN PICO_DEFAULT_LED_PIN  // GPIO25
#define LED_BLINK_PERIOD_MS 250       // 点滅周期（0.5秒）
#define LED_BLINK_COUNT 3             // 点滅回数

typedef enum {
    MIDI_MSG_NONE = 0,
    MIDI_MSG_CC = 1,
    MIDI_MSG_PC = 2,
    MIDI_MSG_NOTE = 3
} midi_msg_type_t;

typedef enum {
    SWITCH_EVENT_PRESS = 0,
    SWITCH_EVENT_RELEASE = 1
} switch_event_t;

typedef enum {
    SYSEX_CMD_GET_INFO = 0x01,      // スイッチ数やバージョンを返す
    SYSEX_CMD_GET_MESSAGE = 0x02,   // 特定のスイッチの設定を取得
    SYSEX_CMD_SET_MESSAGE = 0x03    // 特定のスイッチの設定をセット
} sysex_command_t;

typedef struct {
    midi_msg_type_t msg_type;
    uint8_t channel;
    uint8_t param1;
    uint8_t param2;
} midi_config_t;

// 各スイッチの状態管理
typedef struct {
    bool state;
    uint32_t debounce_time;
} switch_state_t;

// イベント設定（複数メッセージ対応）
typedef struct {
    uint8_t message_count;                          // 実際のメッセージ数
    midi_config_t messages[MAX_MESSAGES_PER_EVENT]; // メッセージ配列
} event_config_t;

// デバイス全体の設定
typedef struct {
    uint32_t magic;
    uint8_t num_switches;                    // 実際のスイッチ数
    event_config_t events[MAX_SWITCHES * 2]; // [switch_idx * 2 + event_type]
    uint32_t checksum;
} device_config_t;

#define CONFIG_MAGIC 0x4D494449

// SysEx Protocol Constants
#define SYSEX_START_BYTE 0xF0
#define SYSEX_END_BYTE 0xF7
#define SYSEX_MANUFACTURER_ID_1 0x00
#define SYSEX_MANUFACTURER_ID_2 0x7D
#define SYSEX_DEVICE_ID 0x01
#define SYSEX_BASIC_MIN_LENGTH 6

static switch_state_t switch_states[MAX_SWITCHES];
static device_config_t current_config;

// LED control variables
static bool led_blink_active = false;
static uint32_t led_blink_start_time = 0;
static uint8_t led_blink_remaining = 0;
static bool led_blink_state = false;
static uint32_t led_last_toggle_time = 0;

// Function prototypes
void start_led_blink(void);
void update_led_state(void);

// Validation functions
bool validate_midi_config(const midi_config_t* config) {
    return (config->channel <= 15) && 
           (config->param1 <= 127) && 
           (config->param2 <= 127) &&
           (config->msg_type <= MIDI_MSG_NOTE);
}

bool is_debounce_elapsed(uint32_t last_time, uint32_t current_time) {
    return (current_time - last_time) >= DEBOUNCE_TIME_MS;
}


void init_default_config(void) {
    current_config.magic = CONFIG_MAGIC;
    current_config.num_switches = num_switches;
    
    // すべてのイベントをクリア
    memset(current_config.events, 0, sizeof(current_config.events));
    
    // デフォルト設定：全ボタンにCC連番を設定
    uint8_t cc_number = 0;  // CC番号の開始値
    
    for (uint8_t i = 0; i < num_switches && i < MAX_SWITCHES; i++) {
        // Press イベント（CC値127）
        uint8_t press_idx = i * 2 + 0;
        current_config.events[press_idx].message_count = 1;
        midi_config_t* press_msg = &current_config.events[press_idx].messages[0];
        press_msg->msg_type = MIDI_MSG_CC;
        press_msg->channel = 0;
        press_msg->param1 = cc_number;  // CC番号
        press_msg->param2 = 127;        // Press時は127
        
        // Release イベント（CC値0）
        uint8_t release_idx = i * 2 + 1;
        current_config.events[release_idx].message_count = 1;
        midi_config_t* release_msg = &current_config.events[release_idx].messages[0];
        release_msg->msg_type = MIDI_MSG_CC;
        release_msg->channel = 0;
        release_msg->param1 = cc_number;  // 同じCC番号
        release_msg->param2 = 0;          // Release時は0
        
        cc_number++;  // 次のボタンは次のCC番号
        if (cc_number > 127) cc_number = 0;  // CC番号は0-127の範囲
    }
    
    current_config.checksum = 0;
}

uint32_t calculate_checksum(const device_config_t* config) {
    // Simple CRC32-like hash (not full CRC32 to avoid extra dependencies)
    uint32_t hash = 0x12345678;
    const uint8_t* data = (const uint8_t*)config;
    size_t len = sizeof(device_config_t) - sizeof(uint32_t);
    
    for (size_t i = 0; i < len; i++) {
        hash = hash ^ data[i];
        for (int j = 0; j < 8; j++) {
            if (hash & 1) {
                hash = (hash >> 1) ^ 0xEDB88320;
            } else {
                hash = hash >> 1;
            }
        }
    }
    return hash;
}

bool save_config_to_flash(void) {
    current_config.checksum = calculate_checksum(&current_config);
    
    uint32_t interrupts = save_and_disable_interrupts();
    
    // Erase flash sector
    flash_range_erase(FLASH_TARGET_OFFSET, FLASH_SECTOR_SIZE);
    
    // Program config to flash
    flash_range_program(FLASH_TARGET_OFFSET, (const uint8_t*)&current_config, sizeof(device_config_t));
    
    restore_interrupts(interrupts);
    
    // Verify written data
    const device_config_t* flash_config = (const device_config_t*)(XIP_BASE + FLASH_TARGET_OFFSET);
    if (flash_config->magic != CONFIG_MAGIC) {
        return false;
    }
    
    uint32_t expected_checksum = calculate_checksum(flash_config);
    if (flash_config->checksum != expected_checksum) {
        return false;
    }
    return true;
}

bool load_config_from_flash(void) {
    const device_config_t* flash_config = (const device_config_t*)(XIP_BASE + FLASH_TARGET_OFFSET);
    
    if (flash_config->magic != CONFIG_MAGIC) {
        return false;
    }
    
    uint32_t expected_checksum = calculate_checksum(flash_config);
    if (flash_config->checksum != expected_checksum) {
        return false;
    }
    
    memcpy(&current_config, flash_config, sizeof(device_config_t));
    return true;
}

void send_midi_message(const midi_config_t* config) {
    if (!validate_midi_config(config)) {
        return;
    }
    
    // Do nothing if message type is NONE
    if (config->msg_type == MIDI_MSG_NONE) {
        return;
    }
    
    uint8_t packet[4] = {0};
    
    switch (config->msg_type) {
        case MIDI_MSG_CC:
            packet[0] = MIDI_CABLE_NUM << 4 | 0x0B;
            packet[1] = 0xB0 | config->channel;
            packet[2] = config->param1;
            packet[3] = config->param2;
            break;
            
        case MIDI_MSG_PC:
            packet[0] = MIDI_CABLE_NUM << 4 | 0x0C;
            packet[1] = 0xC0 | config->channel;
            packet[2] = config->param1;
            packet[3] = 0;
            break;
            
        case MIDI_MSG_NOTE:
            if (config->param2 > 0) {
                packet[0] = MIDI_CABLE_NUM << 4 | 0x09; // Note On
                packet[1] = 0x90 | config->channel;
            } else {
                packet[0] = MIDI_CABLE_NUM << 4 | 0x08; // Note Off
                packet[1] = 0x80 | config->channel;
            }
            packet[2] = config->param1;
            packet[3] = config->param2;
            break;
            
        default:
            return;
    }
    
    if (tud_midi_mounted()) {
        tud_midi_stream_write(MIDI_CABLE_NUM, packet, 4);
        start_led_blink();  // MIDI送信時にLED点滅開始
    }
}

void send_midi_messages(const event_config_t* event) {
    if (!tud_midi_mounted() || !event) return;
    
    // 設定されているすべてのメッセージを連続送信
    for (uint8_t i = 0; i < event->message_count; i++) {
        const midi_config_t* msg = &event->messages[i];
        
        if (msg->msg_type == MIDI_MSG_NONE) continue;
        
        uint8_t packet[4] = {0};
        
        switch (msg->msg_type) {
            case MIDI_MSG_CC:
                packet[0] = MIDI_CABLE_NUM << 4 | 0x0B;
                packet[1] = 0xB0 | msg->channel;
                packet[2] = msg->param1;
                packet[3] = msg->param2;
                break;
                
            case MIDI_MSG_PC:
                packet[0] = MIDI_CABLE_NUM << 4 | 0x0C;
                packet[1] = 0xC0 | msg->channel;
                packet[2] = msg->param1;
                packet[3] = 0;
                break;
                
            case MIDI_MSG_NOTE:
                if (msg->param2 > 0) {
                    packet[0] = MIDI_CABLE_NUM << 4 | 0x09;  // Note On
                    packet[1] = 0x90 | msg->channel;
                } else {
                    packet[0] = MIDI_CABLE_NUM << 4 | 0x08;  // Note Off
                    packet[1] = 0x80 | msg->channel;
                }
                packet[2] = msg->param1;
                packet[3] = msg->param2;
                break;
        }
        
        tud_midi_stream_write(MIDI_CABLE_NUM, packet, 4);
    }
    
    start_led_blink();  // LED点滅開始
}

void start_led_blink(void) {
    led_blink_active = true;
    led_blink_remaining = LED_BLINK_COUNT * 2; // ON/OFFで2回カウント
    led_blink_start_time = board_millis();
    led_last_toggle_time = led_blink_start_time;
    led_blink_state = true;
}

void update_led_state(void) {
    if (led_blink_active) {
        uint32_t now = board_millis();
        if (now - led_last_toggle_time >= LED_BLINK_PERIOD_MS / 2) {
            led_blink_state = !led_blink_state;
            led_last_toggle_time = now;
            led_blink_remaining--;
            
            if (led_blink_remaining == 0) {
                led_blink_active = false;
            }
        }
        board_led_write(led_blink_state);
    } else {
        // 通常時はUSB接続状態を表示
        board_led_write(tud_mounted());
    }
}

void check_switches(void) {
    uint32_t now = board_millis();
    
    for (uint8_t i = 0; i < num_switches; i++) {
        bool pressed = !gpio_get(switch_pins[i]);
        
        if (pressed != switch_states[i].state && 
            is_debounce_elapsed(switch_states[i].debounce_time, now)) {
            
            switch_states[i].state = pressed;
            switch_states[i].debounce_time = now;
            
            // イベント設定のインデックス計算
            uint8_t event_idx = i * 2 + (pressed ? 0 : 1);
            send_midi_messages(&current_config.events[event_idx]);
        }
    }
}

void send_info_response(void) {
    uint8_t response[] = {
        SYSEX_START_BYTE, SYSEX_MANUFACTURER_ID_1, SYSEX_MANUFACTURER_ID_2, SYSEX_DEVICE_ID,
        SYSEX_CMD_GET_INFO,
        num_switches,  // スイッチ数
        0x01,          // バージョン（1.0）
        SYSEX_END_BYTE
    };
    tud_midi_stream_write(MIDI_CABLE_NUM, response, sizeof(response));
}

void send_message_response(uint8_t switch_num, uint8_t event_type) {
    if (switch_num >= num_switches || event_type > 1) return;
    
    uint8_t event_idx = switch_num * 2 + event_type;
    event_config_t* event = &current_config.events[event_idx];
    
    // 応答バッファ（最大サイズ）
    uint8_t response[64];
    uint8_t pos = 0;
    
    response[pos++] = SYSEX_START_BYTE;
    response[pos++] = SYSEX_MANUFACTURER_ID_1;
    response[pos++] = SYSEX_MANUFACTURER_ID_2; 
    response[pos++] = SYSEX_DEVICE_ID;
    response[pos++] = SYSEX_CMD_GET_MESSAGE;
    response[pos++] = switch_num;
    response[pos++] = event_type;
    response[pos++] = event->message_count;
    
    // 各メッセージのデータを追加
    for (uint8_t i = 0; i < event->message_count && pos < 60; i++) {
        midi_config_t* msg = &event->messages[i];
        response[pos++] = msg->msg_type;
        response[pos++] = msg->channel;
        response[pos++] = msg->param1;
        response[pos++] = msg->param2;
    }
    
    response[pos++] = SYSEX_END_BYTE;
    tud_midi_stream_write(MIDI_CABLE_NUM, response, pos);
}

void send_success_response(void) {
    uint8_t response[] = {
        SYSEX_START_BYTE, SYSEX_MANUFACTURER_ID_1, SYSEX_MANUFACTURER_ID_2, SYSEX_DEVICE_ID,
        SYSEX_CMD_SET_MESSAGE,
        0x00,  // 成功
        SYSEX_END_BYTE
    };
    tud_midi_stream_write(MIDI_CABLE_NUM, response, sizeof(response));
}

void send_error_response(void) {
    uint8_t response[] = {
        SYSEX_START_BYTE, SYSEX_MANUFACTURER_ID_1, SYSEX_MANUFACTURER_ID_2, SYSEX_DEVICE_ID,
        SYSEX_CMD_SET_MESSAGE,
        0x01,  // エラー
        SYSEX_END_BYTE
    };
    tud_midi_stream_write(MIDI_CABLE_NUM, response, sizeof(response));
}

void process_sysex_data(const uint8_t* data, uint16_t length) {
    printf("Process SysEx: len=%d\n", length);
    
    // 基本バリデーション
    if (length < SYSEX_BASIC_MIN_LENGTH || data[0] != SYSEX_START_BYTE || data[length-1] != SYSEX_END_BYTE) {
        printf("Invalid SysEx\n");
        return;
    }
    
    // メーカーIDとデバイスIDをチェック
    if (data[1] != SYSEX_MANUFACTURER_ID_1 || data[2] != SYSEX_MANUFACTURER_ID_2 || data[3] != SYSEX_DEVICE_ID) {
        return;
    }
    
    uint8_t command = data[4];
    
    switch (command) {
        case SYSEX_CMD_GET_INFO: {
            if (length == SYSEX_BASIC_MIN_LENGTH) {
                send_info_response();
            }
            break;
        }
        
        case SYSEX_CMD_GET_MESSAGE: {
            if (length == 8) {  // F0 00 7D 01 02 <switch> <event> F7
                uint8_t switch_num = data[5];
                uint8_t event_type = data[6];
                send_message_response(switch_num, event_type);
            }
            break;
        }
        
        case SYSEX_CMD_SET_MESSAGE: {
            if (length >= 9) {  // 最低でもヘッダ+スイッチ+イベント+メッセージ数
                uint8_t switch_num = data[5];
                uint8_t event_type = data[6];
                uint8_t message_count = data[7];
                
                // バリデーション
                if (switch_num >= num_switches || event_type > 1 || 
                    message_count > MAX_MESSAGES_PER_EVENT || 
                    length < 8 + message_count * 4) {
                    send_error_response();
                    return;
                }
                
                uint8_t event_idx = switch_num * 2 + event_type;
                event_config_t* event = &current_config.events[event_idx];
                
                // メッセージをクリア
                event->message_count = 0;
                memset(event->messages, 0, sizeof(event->messages));
                
                // 新しいメッセージを設定
                uint8_t pos = 8;
                for (uint8_t i = 0; i < message_count && pos + 3 < length; i++) {
                    midi_config_t* msg = &event->messages[i];
                    msg->msg_type = data[pos++];
                    msg->channel = data[pos++] & 0x0F;
                    msg->param1 = data[pos++] & 0x7F;
                    msg->param2 = data[pos++] & 0x7F;
                    
                    if (validate_midi_config(msg)) {
                        event->message_count++;
                    } else {
                        send_error_response();
                        return;
                    }
                }
                
                save_config_to_flash();
                send_success_response();
            } else {
                send_error_response();
            }
            break;
        }
    }
}

void tud_midi_rx_cb(uint8_t port) {
    printf("RX CB called, port=%d, available=%d\n", port, tud_midi_available());
    static uint8_t sysex_buffer[SYSEX_BUFFER_SIZE];
    static uint16_t sysex_pos = 0;
    
    uint8_t midi_data[32]; // Buffer for MIDI stream data
    
    while (tud_midi_available()) {
        uint32_t bytes_read = tud_midi_stream_read(midi_data, sizeof(midi_data));
        if (bytes_read == 0) break;
        
        printf("MIDI stream: %d bytes\n", bytes_read);
        start_led_blink();  // MIDI受信時にLED点滅開始
        
        // Process pure MIDI data stream
        for (uint32_t i = 0; i < bytes_read; i++) {
            uint8_t byte = midi_data[i];
            
            if (byte == SYSEX_START_BYTE) {
                // Start of SysEx
                printf("SysEx start\n");
                sysex_pos = 0;
                sysex_buffer[sysex_pos++] = byte;
            } else if (byte == SYSEX_END_BYTE) {
                // End of SysEx  
                printf("SysEx end, pos=%d\n", sysex_pos);
                if (sysex_pos < SYSEX_BUFFER_SIZE) {
                    sysex_buffer[sysex_pos++] = byte;
                    process_sysex_data(sysex_buffer, sysex_pos);
                }
                sysex_pos = 0;
                // Continue processing remaining data, don't return
            } else if (sysex_pos > 0 && sysex_pos < SYSEX_BUFFER_SIZE - 1) {
                // Data byte (only process if we're in a SysEx)
                printf("SysEx data: %02X\n", byte);
                sysex_buffer[sysex_pos++] = byte;
            } else {
                printf("MIDI byte: %02X\n", byte);
            }
        }
    }
}

int main(void) {
    board_init();
    
    printf("TinyUSB MIDI Startup\n");
    
    // 配列内の各ピンを初期化
    for (uint8_t i = 0; i < num_switches; i++) {
        gpio_init(switch_pins[i]);
        gpio_set_dir(switch_pins[i], GPIO_IN);
        gpio_pull_up(switch_pins[i]);
        
        switch_states[i].state = false;
        switch_states[i].debounce_time = 0;
    }
    
    init_default_config();
    if (!load_config_from_flash()) {
        save_config_to_flash();
    }
    
    tusb_init();
    
    
    printf("Entering main loop\n");
    
    while (1) {
        tud_task();
        check_switches();
        update_led_state();
    }
    
    return 0;
}
