#include <stdlib.h>
#include <stdio.h>
#include <string.h>

#include "bsp/board.h"
#include "tusb.h"
#include "hardware/gpio.h"
#include "hardware/flash.h" 
#include "pico/flash.h"
#include "hardware/sync.h"

#define TIP_PIN 2    // TRS Tip (Switch 1)
#define RING_PIN 3   // TRS Ring (Switch 2)

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
    SYSEX_CMD_SET_CONFIG = 0x01,
    SYSEX_CMD_GET_CONFIG = 0x02,
    SYSEX_CMD_CONFIG_RESPONSE = 0x03
} sysex_command_t;

typedef struct {
    midi_msg_type_t msg_type;
    uint8_t channel;
    uint8_t param1;
    uint8_t param2;
} midi_config_t;

typedef struct {
    uint32_t magic;
    midi_config_t switch1_press;
    midi_config_t switch1_release;
    midi_config_t switch2_press;
    midi_config_t switch2_release;
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

static device_config_t current_config;
static bool switch1_state = false;
static bool switch2_state = false;
static uint32_t switch1_debounce_time = 0;
static uint32_t switch2_debounce_time = 0;

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

bool send_config_response(uint8_t switch_num, uint8_t event_type, const midi_config_t* config) {
    if (!tud_midi_mounted()) {
        printf("MIDI not mounted\n");
        return false;
    }
    
    uint8_t sysex_msg[] = {
        SYSEX_START_BYTE, SYSEX_MANUFACTURER_ID_1, SYSEX_MANUFACTURER_ID_2, SYSEX_DEVICE_ID, SYSEX_CMD_CONFIG_RESPONSE,
        switch_num, event_type, config->msg_type, config->channel,
        config->param1, config->param2, SYSEX_END_BYTE
    };
    
    uint32_t written = tud_midi_stream_write(MIDI_CABLE_NUM, sysex_msg, sizeof(sysex_msg));
    printf("Response sent: %d bytes\\n", written);
    return written == sizeof(sysex_msg);
}

void send_all_config(void) {
    printf("Sending all config\n");
    
    send_config_response(0, SWITCH_EVENT_PRESS, &current_config.switch1_press);
    send_config_response(0, SWITCH_EVENT_RELEASE, &current_config.switch1_release);
    send_config_response(1, SWITCH_EVENT_PRESS, &current_config.switch2_press);
    send_config_response(1, SWITCH_EVENT_RELEASE, &current_config.switch2_release);
}

void init_default_config(void) {
    current_config.magic = CONFIG_MAGIC;
    
    current_config.switch1_press = (midi_config_t){MIDI_MSG_CC, 0, 64, 127};
    current_config.switch1_release = (midi_config_t){MIDI_MSG_CC, 0, 64, 0};
    current_config.switch2_press = (midi_config_t){MIDI_MSG_PC, 0, 1, 0};
    current_config.switch2_release = (midi_config_t){MIDI_MSG_PC, 0, 0, 0};
    
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
    
    bool tip_pressed = !gpio_get(TIP_PIN);
    bool ring_pressed = !gpio_get(RING_PIN);
    
    if (tip_pressed != switch1_state && is_debounce_elapsed(switch1_debounce_time, now)) {
        switch1_state = tip_pressed;
        switch1_debounce_time = now;
        
        if (switch1_state) {
            send_midi_message(&current_config.switch1_press);
        } else {
            send_midi_message(&current_config.switch1_release);
        }
    }
    
    if (ring_pressed != switch2_state && is_debounce_elapsed(switch2_debounce_time, now)) {
        switch2_state = ring_pressed;
        switch2_debounce_time = now;
        
        if (switch2_state) {
            send_midi_message(&current_config.switch2_press);
        } else {
            send_midi_message(&current_config.switch2_release);
        }
    }
}

void process_sysex_data(const uint8_t* data, uint16_t length) {
    printf("Process SysEx: len=%d\n", length);
    // Basic validation
    if (length < SYSEX_BASIC_MIN_LENGTH || data[0] != SYSEX_START_BYTE || data[length-1] != SYSEX_END_BYTE) {
        printf("Invalid SysEx\n");
        return;
    }
    
    // Check manufacturer ID and device type
    if (data[1] != SYSEX_MANUFACTURER_ID_1 || data[2] != SYSEX_MANUFACTURER_ID_2 || data[3] != SYSEX_DEVICE_ID) {
        return;
    }
    
    uint8_t command = data[4];
    
    // Handle commands
    if (command == SYSEX_CMD_GET_CONFIG) {
        printf("GET_CONFIG command\n");
        if (length == SYSEX_BASIC_MIN_LENGTH) {
            send_all_config();
        }
        return;
    } else if (command != SYSEX_CMD_SET_CONFIG) {
        return;
    }
    
    // Set config command validation
    if (length < 11) return;
    
    uint8_t switch_num = data[5];
    uint8_t event_type = data[6];
    uint8_t msg_type = data[7];
    uint8_t channel = data[8] & 0x0F;
    uint8_t param1 = data[9] & 0x7F;
    uint8_t param2 = (length > 10) ? (data[10] & 0x7F) : 0;
    
    // Range validation
    if (switch_num > 1 || event_type > 1) {
        return;
    }
    
    // Create temporary config for validation
    midi_config_t temp_config = {
        .msg_type = msg_type,
        .channel = channel,
        .param1 = param1,
        .param2 = param2
    };
    
    if (!validate_midi_config(&temp_config)) {
        return;
    }
    
    // Find target configuration
    midi_config_t* target_config = NULL;
    
    if (switch_num == 0 && event_type == SWITCH_EVENT_PRESS) {
        target_config = &current_config.switch1_press;
    } else if (switch_num == 0 && event_type == SWITCH_EVENT_RELEASE) {
        target_config = &current_config.switch1_release;
    } else if (switch_num == 1 && event_type == SWITCH_EVENT_PRESS) {
        target_config = &current_config.switch2_press;
    } else if (switch_num == 1 && event_type == SWITCH_EVENT_RELEASE) {
        target_config = &current_config.switch2_release;
    }
    
    if (target_config) {
        *target_config = temp_config;
        save_config_to_flash();
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
    gpio_init(TIP_PIN);
    gpio_set_dir(TIP_PIN, GPIO_IN);
    gpio_pull_up(TIP_PIN);
    
    gpio_init(RING_PIN);
    gpio_set_dir(RING_PIN, GPIO_IN);
    gpio_pull_up(RING_PIN);
    
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
