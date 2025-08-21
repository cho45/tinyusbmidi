# == DO NOT EDIT THE FOLLOWING LINES for the Raspberry Pi Pico VS Code Extension to work ==
if(WIN32)
    set(USERHOME $ENV{USERPROFILE})
else()
    set(USERHOME $ENV{HOME})
endif()
set(sdkVersion 2.2.0)
set(toolchainVersion 14_2_Rel1)
set(picotoolVersion 2.2.0)
set(picoVscode ${USERHOME}/.pico-sdk/cmake/pico-vscode.cmake)
if (EXISTS ${picoVscode})
    include(${picoVscode})
endif()
# ====================================================================================
set(PICO_BOARD pico CACHE STRING "Board type")

cmake_minimum_required(VERSION 3.13)

# VSCode用にcompile_commands.jsonを生成
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

include(pico_sdk_import.cmake)

project(picomidi C CXX ASM)

pico_sdk_init()

# GPIO pins configuration option
set(GPIO_PINS "2,3" CACHE STRING "Comma-separated list of GPIO pins for switches")

# Process GPIO_PINS to generate switch_pins.h
string(REPLACE "," ";" PIN_LIST ${GPIO_PINS})
list(LENGTH PIN_LIST NUM_SWITCHES)
string(REPLACE ";" ", " SWITCH_PINS_ARRAY "${PIN_LIST}")

# Configure the header file
configure_file(switch_pins.h.in switch_pins.h @ONLY)

add_executable(picomidi
    picomidi.c
    usb_descriptors.c
)

target_include_directories(picomidi PUBLIC
    .
    ${CMAKE_CURRENT_BINARY_DIR}
)

target_link_libraries(picomidi 
    pico_stdlib
    tinyusb_device
    tinyusb_board
    hardware_gpio
    hardware_flash
    pico_flash
)

pico_enable_stdio_usb(picomidi 0)
pico_enable_stdio_uart(picomidi 1)

pico_add_extra_outputs(picomidi)
