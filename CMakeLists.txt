cmake_minimum_required(VERSION 3.13)

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