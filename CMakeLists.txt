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

project(tinyusbmidi C CXX ASM)

pico_sdk_init()

add_executable(tinyusbmidi
    tinyusbmidi.c
    usb_descriptors.c
)

target_include_directories(tinyusbmidi PUBLIC
    .
)

target_link_libraries(tinyusbmidi 
    pico_stdlib
    tinyusb_device
    tinyusb_board
    hardware_gpio
    hardware_flash
    pico_flash
)

pico_enable_stdio_usb(tinyusbmidi 0)
pico_enable_stdio_uart(tinyusbmidi 1)

pico_add_extra_outputs(tinyusbmidi)
