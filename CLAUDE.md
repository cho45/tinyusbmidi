# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TinyUSB MIDI Footswitch is a Raspberry Pi Pico (RP2040) firmware that converts TRS footswitch inputs into USB MIDI messages. The project includes both embedded firmware and a WebMIDI-based configuration tool.

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
npx serve .
# Open http://localhost:3000 in Chrome/Edge/Opera
```

## Architecture Overview

### Firmware Architecture
- **tinyusbmidi.c**: Main firmware logic with GPIO handling, MIDI output, SysEx processing
- **usb_descriptors.c**: USB MIDI device descriptors using TinyUSB macros  
- **tusb_config.h**: TinyUSB configuration (MIDI device class enabled)
- **CMakeLists.txt**: Pico SDK build configuration

### Key Hardware Configuration
- **GPIO Pins**: GP3 (TIP/Switch1), GP4 (RING/Switch2) with internal pullups
- **TRS Input**: 3.5mm stereo jack for 2-switch footswitch connection
- **USB**: Class-compliant MIDI device "TinyUSB MIDI Footswitch"
- **Flash Storage**: Configuration saved at 256KB offset for persistence

### Software Architecture

#### MIDI Message Processing
- **Switch Detection**: Debounced GPIO reading (20ms) for Press/Release events
- **MIDI Output**: Configurable CC/PC/Note messages per switch event  
- **Message Types**: MIDI_MSG_NONE(0), MIDI_MSG_CC(1), MIDI_MSG_PC(2), MIDI_MSG_NOTE(3)

#### SysEx Configuration Protocol
```
Set Config:  F0 00 7D 01 01 <switch> <event> <msgtype> <channel> <param1> <param2> F7
Get Config:  F0 00 7D 01 02 F7  
Config Response: F0 00 7D 01 03 <switch> <event> <msgtype> <channel> <param1> <param2> F7
```

#### Configuration Storage
- **Flash Location**: 256KB offset to avoid code overlap
- **Validation**: Magic number (0x4D494449) and CRC32-like checksum
- **Structure**: 4 configurations (Switch1/2 × Press/Release)

### WebMIDI Configuration Tool
- **app.js**: Main application controller with auto-reconnection and change detection
- **midi-manager.js**: WebMIDI API wrapper and SysEx protocol implementation
- **index.html**: Configuration UI with real-time change highlighting
- **style.css**: Dark theme with modification indicators

#### Key Features
- Auto-reconnection to last connected device
- Real-time change detection with visual feedback  
- Local file save/load for configuration backup
- Live communication logging

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

### GPIO Initialization
```c
gpio_init(TIP_PIN);
gpio_set_dir(TIP_PIN, GPIO_IN); 
gpio_pull_up(TIP_PIN);  // Internal pullup enabled
```

### MIDI Message Generation
```c
// Example CC message
uint8_t packet[4] = {
    MIDI_CABLE_NUM << 4 | 0x0B,  // CIN for CC
    0xB0 | channel,              // CC status + channel
    param1,                      // CC number
    param2                       // CC value
};
tud_midi_stream_write(MIDI_CABLE_NUM, packet, 4);
```

### Flash Configuration Save
```c
uint32_t interrupts = save_and_disable_interrupts();
flash_range_erase(FLASH_TARGET_OFFSET, FLASH_SECTOR_SIZE);
flash_range_program(FLASH_TARGET_OFFSET, (const uint8_t*)&config, sizeof(device_config_t));
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
- **SysEx timeouts**: Check that all 4 config responses are sent sequentially