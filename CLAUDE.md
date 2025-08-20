# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TinyUSB MIDI Footswitch is a Raspberry Pi Pico (RP2040) firmware that converts multiple GPIO inputs into USB MIDI messages. The project supports up to 16 switches with up to 10 MIDI messages per press/release event. It includes both embedded firmware and a Vue.js 3 WebMIDI configuration tool.

## Build Commands

### Firmware Build
```bash
# Create build directory
mkdir build && cd build

# Configure build
cmake .. -G Ninja

# Build firmware
ninja

# Output files:
# - tinyusbmidi.uf2 (for drag-and-drop flashing)
# - tinyusbmidi.elf (for SWD debugging)
```

### Firmware Flashing
```bash
# Method 1: UF2 drag-and-drop (recommended)
# 1. Hold BOOTSEL button while connecting Pico to USB
# 2. Copy build/tinyusbmidi.uf2 to RPI-RP2 drive

# Method 2: picotool
picotool load tinyusbmidi.uf2
picotool reboot

# Method 3: SWD debugging (with debug probe)
openocd -f interface/picoprobe.cfg -f target/rp2040.cfg -c "program tinyusbmidi.elf verify reset exit"
```

### Configuration Tool
```bash
# Serve WebMIDI configuration tool
cd config-app
npm run serve
# or directly: npx serve .
# Open http://localhost:3000 in Chrome/Edge/Opera

# Lint JavaScript code
npm run lint
npm run lint:fix
```

## Architecture Overview

### Firmware Architecture
- **tinyusbmidi.c**: Main firmware logic with GPIO handling, MIDI output, SysEx processing
- **usb_descriptors.c**: USB MIDI device descriptors using TinyUSB macros  
- **tusb_config.h**: TinyUSB configuration (MIDI device class enabled)
- **CMakeLists.txt**: Pico SDK build configuration

### Key Hardware Configuration
- **GPIO Pins**: Array-based configuration via CMake-generated `switch_pins.h` (default: GP2, GP3)
- **Maximum Switches**: Up to 16 switches supported (configurable at build time)
- **USB**: Class-compliant MIDI device "TinyUSB MIDI Footswitch"
- **Flash Storage**: Configuration saved at 256KB offset for persistence
- **Memory Usage**: ~1,321 bytes for 16 switches (well within RP2040's 264KB RAM)

### Software Architecture

#### MIDI Message Processing
- **Switch Detection**: Debounced GPIO reading (20ms) for Press/Release events
- **MIDI Output**: Up to 10 configurable CC/PC/Note messages per switch event (sent consecutively)
- **Message Types**: MIDI_MSG_NONE(0), MIDI_MSG_CC(1), MIDI_MSG_PC(2), MIDI_MSG_NOTE(3)
- **Multi-Message**: Each press/release can trigger multiple MIDI messages sequentially

#### SysEx Configuration Protocol (Simplified)
```
Get Info:        F0 00 7D 01 01 F7
Get Messages:    F0 00 7D 01 02 <switch> <event> F7
Set Messages:    F0 00 7D 01 03 <switch> <event> <count> [<msg_data>...] F7
```
- **GET_INFO (0x01)**: Returns device info (switch count, version)
- **GET_MESSAGE (0x02)**: Returns all messages for specific switch/event
- **SET_MESSAGE (0x03)**: Sets multiple messages for specific switch/event

#### Configuration Storage
- **Flash Location**: 256KB offset to avoid code overlap
- **Validation**: Magic number (0x4D494449) and CRC32-like checksum
- **Structure**: Dynamic array for up to 16 switches × 2 events × 10 messages
- **Memory Footprint**: Efficient packed structure (~82 bytes per switch)

### WebMIDI Configuration Tool (Vue.js 3)
- **app.js**: Vue.js 3 Composition API application with reactive state management
- **midi-manager.js**: WebMIDI API wrapper with event-driven SysEx protocol
- **index.html**: Dynamic multi-switch/multi-message configuration UI
- **style.css**: Dark theme with loading states and change indicators

#### Key Features
- **Auto-connection**: Automatic detection and connection to TinyUSB MIDI Footswitch
- **Multi-switch UI**: Dynamic interface generation based on device switch count
- **Multi-message Management**: Up to 10 messages per switch event with intuitive UI
- **Real-time Change Detection**: Visual feedback for unsaved changes with deep object comparison
- **Loading States**: UI disabling during configuration loading/saving operations
- **File Operations**: JSON-based configuration backup and restore
- **Live Logging**: Real-time MIDI and SysEx communication monitoring

## Development Guidelines

### Firmware Development
- Use `printf()` for debug output (UART0 on GP0/GP1)
- MIDI stream processing uses `tud_midi_stream_read()` for pure MIDI data (not USB packets)
- Flash operations require interrupt disable/restore
- All SysEx parameters are 7-bit values (0-127)

### Configuration Tool Development  
- WebMIDI API requires HTTPS or localhost
- Only works in Chrome/Edge/Opera browsers
- SysEx permissions required for device communication
- Use localStorage for persistence across sessions

### Testing
- Hardware: Connect TRS footswitch to test GPIO input
- Software: Use WebMIDI tool for end-to-end configuration testing
- Monitor: Serial console for debug output and MIDI traffic logging

## Important Code Patterns

### GPIO Initialization (Array-based)
```c
// Pin configuration generated by CMake in switch_pins.h
#include "switch_pins.h"  // Defines switch_pins[] array and num_switches

// Initialize all switches
for (uint8_t i = 0; i < num_switches; i++) {
    gpio_init(switch_pins[i]);
    gpio_set_dir(switch_pins[i], GPIO_IN);
    gpio_pull_up(switch_pins[i]);
    
    switch_states[i].state = false;
    switch_states[i].debounce_time = 0;
}
```

### MIDI Message Generation (Multi-message)
```c
// Send multiple messages for a single event
void send_event_messages(uint8_t switch_idx, switch_event_t event) {
    event_config_t *event_config = &device_config.events[switch_idx * 2 + event];
    
    for (int i = 0; i < event_config->message_count; i++) {
        midi_config_t *msg = &event_config->messages[i];
        if (msg->msg_type != MIDI_MSG_NONE) {
            send_midi_message(msg);
        }
    }
}
```

### Flash Configuration Save (Multi-switch)
```c
// Device configuration structure
typedef struct {
    uint32_t magic;                           // 0x4D494449
    uint8_t num_switches;                     // Number of active switches
    event_config_t events[MAX_SWITCHES * 2]; // Switch events (press/release)
    uint32_t checksum;                        // Simple checksum
} device_config_t;

// Save configuration
uint32_t interrupts = save_and_disable_interrupts();
flash_range_erase(FLASH_TARGET_OFFSET, FLASH_SECTOR_SIZE);
flash_range_program(FLASH_TARGET_OFFSET, (const uint8_t*)&device_config, sizeof(device_config_t));
restore_interrupts(interrupts);
```

## Debugging

### Serial Debug Output
- Connect USB-UART adapter to GP0(TX)/GP1(RX) 
- 115200 baud, 8N1
- Debug prints show MIDI traffic and SysEx processing

### Common Issues
- **Build errors**: Ensure Pico SDK environment is properly configured
- **Flash conflicts**: Configuration stored at 256KB offset, avoid overlaps
- **MIDI stream bugs**: Use `tud_midi_stream_read()`, not manual USB packet parsing
- **SysEx timeouts**: Multi-message responses may take longer; ensure proper timeout handling
- **WebMIDI browser support**: Only Chrome/Edge/Opera support WebMIDI API
- **Change detection issues**: Ensure proper deep copying when loading configurations
- **Memory constraints**: 16 switches * 10 messages = significant memory usage; monitor RAM usage