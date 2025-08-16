/**
 * MIDI Manager - WebMIDI API wrapper and SysEx protocol implementation
 * Handles all MIDI device communication for TinyUSB MIDI Footswitch
 */

class MidiManager extends EventTarget {
    constructor() {
        super();
        this.midiAccess = null;
        this.currentInput = null;
        this.currentOutput = null;
        this.isConnected = false;
        this.responseTimeout = 2000; // 2 seconds timeout for responses
        this.pendingResponses = new Map();
    }

    /**
     * Initialize WebMIDI API
     */
    async initialize() {
        try {
            if (!navigator.requestMIDIAccess) {
                throw new Error('WebMIDI API is not supported in this browser');
            }

            this.midiAccess = await navigator.requestMIDIAccess({ sysex: true });
            
            // Listen for device connection/disconnection
            this.midiAccess.addEventListener('statechange', (event) => {
                this.handleStateChange(event);
            });

            this.refreshDeviceList();
            return true;
        } catch (error) {
            this.dispatchEvent(new CustomEvent('error', { 
                detail: { message: `Failed to initialize MIDI: ${error.message}` }
            }));
            return false;
        }
    }

    /**
     * Get list of available MIDI devices
     */
    getAvailableDevices() {
        const devices = [];
        if (!this.midiAccess) return devices;

        // Get input devices
        for (const input of this.midiAccess.inputs.values()) {
            const output = Array.from(this.midiAccess.outputs.values())
                .find(out => out.name === input.name);
            
            if (output) {
                devices.push({
                    id: input.id,
                    name: input.name,
                    manufacturer: input.manufacturer,
                    input: input,
                    output: output
                });
            }
        }

        return devices;
    }

    /**
     * Connect to a MIDI device
     */
    async connectDevice(deviceId) {
        try {
            const devices = this.getAvailableDevices();
            const device = devices.find(d => d.id === deviceId);
            
            if (!device) {
                throw new Error('Device not found');
            }

            // Disconnect current device if any
            if (this.isConnected) {
                this.disconnect();
            }

            this.currentInput = device.input;
            this.currentOutput = device.output;

            // Set up message handler
            this.currentInput.onmidimessage = (event) => {
                this.handleMidiMessage(event);
            };

            this.isConnected = true;
            
            this.dispatchEvent(new CustomEvent('connected', { 
                detail: { device: device.name }
            }));

            return true;
        } catch (error) {
            this.dispatchEvent(new CustomEvent('error', { 
                detail: { message: `Failed to connect: ${error.message}` }
            }));
            return false;
        }
    }

    /**
     * Disconnect from current device
     */
    disconnect() {
        if (this.currentInput) {
            this.currentInput.onmidimessage = null;
            this.currentInput = null;
        }
        
        if (this.currentOutput) {
            this.currentOutput = null;
        }

        this.isConnected = false;
        this.pendingResponses.clear();
        
        this.dispatchEvent(new CustomEvent('disconnected'));
    }

    /**
     * Send a configuration to the device
     * @param {number} switchNum - 0 for Switch1, 1 for Switch2
     * @param {number} eventType - 0 for Press, 1 for Release
     * @param {Object} config - Configuration object with msgType, channel, param1, param2
     */
    async sendConfiguration(switchNum, eventType, config) {
        if (!this.isConnected || !this.currentOutput) {
            throw new Error('No device connected');
        }

        const sysexData = [
            0xF0, // SysEx start
            0x00, 0x7D, // Manufacturer ID (non-commercial)
            0x01, // Device ID
            0x01, // Command: Set Config
            switchNum & 0x7F,
            eventType & 0x7F,
            config.msgType & 0x7F,
            config.channel & 0x7F,
            config.param1 & 0x7F,
            config.param2 & 0x7F,
            0xF7  // SysEx end
        ];

        try {
            this.currentOutput.send(sysexData);
            
            this.dispatchEvent(new CustomEvent('sysexSent', { 
                detail: { 
                    message: 'Configuration sent',
                    data: sysexData 
                }
            }));

            return true;
        } catch (error) {
            this.dispatchEvent(new CustomEvent('error', { 
                detail: { message: `Failed to send configuration: ${error.message}` }
            }));
            return false;
        }
    }

    /**
     * Request current configuration from device
     */
    async requestConfiguration() {
        if (!this.isConnected || !this.currentOutput) {
            throw new Error('No device connected');
        }

        const sysexData = [
            0xF0, // SysEx start
            0x00, 0x7D, // Manufacturer ID
            0x01, // Device ID
            0x02, // Command: Get Config
            0xF7  // SysEx end
        ];

        // Create promise for response
        const responsePromise = new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.pendingResponses.delete('config');
                reject(new Error('Response timeout'));
            }, this.responseTimeout);

            this.pendingResponses.set('config', {
                resolve: (data) => {
                    clearTimeout(timeoutId);
                    this.pendingResponses.delete('config');
                    resolve(data);
                },
                reject: (error) => {
                    clearTimeout(timeoutId);
                    this.pendingResponses.delete('config');
                    reject(error);
                }
            });
        });

        try {
            this.currentOutput.send(sysexData);
            
            this.dispatchEvent(new CustomEvent('sysexSent', { 
                detail: { 
                    message: 'Configuration request sent',
                    data: sysexData 
                }
            }));

            const configs = await responsePromise;
            return configs;
        } catch (error) {
            this.dispatchEvent(new CustomEvent('error', { 
                detail: { message: `Failed to request configuration: ${error.message}` }
            }));
            throw error;
        }
    }

    /**
     * Handle incoming MIDI messages
     */
    handleMidiMessage(event) {
        const data = event.data;
        
        // Log all incoming messages
        this.dispatchEvent(new CustomEvent('midiMessage', { 
            detail: { data: Array.from(data) }
        }));

        // Check if it's a SysEx message
        if (data[0] === 0xF0) {
            this.handleSysExMessage(data);
        }
    }

    /**
     * Handle SysEx messages
     */
    handleSysExMessage(data) {
        // Validate SysEx format
        if (data.length < 7 || data[data.length - 1] !== 0xF7) {
            return;
        }

        // Check manufacturer ID and device ID
        if (data[1] !== 0x00 || data[2] !== 0x7D || data[3] !== 0x01) {
            return;
        }

        const command = data[4];
        
        if (command === 0x03) { // Config Response
            this.handleConfigResponse(data);
        }
    }

    /**
     * Handle configuration response from device
     */
    handleConfigResponse(data) {
        if (data.length !== 12) {
            this.dispatchEvent(new CustomEvent('error', { 
                detail: { message: 'Invalid configuration response length' }
            }));
            return;
        }

        const config = {
            switchNum: data[5],
            eventType: data[6],
            msgType: data[7],
            channel: data[8],
            param1: data[9],
            param2: data[10]
        };

        this.dispatchEvent(new CustomEvent('configReceived', { 
            detail: config
        }));

        // Store configuration (collecting all 4 configs)
        if (!this.configBuffer) {
            this.configBuffer = [];
        }
        
        this.configBuffer.push(config);
        
        // If we have all 4 configurations, resolve the promise
        if (this.configBuffer.length === 4) {
            const pending = this.pendingResponses.get('config');
            if (pending) {
                pending.resolve(this.configBuffer);
            }
            this.configBuffer = [];
        }
    }

    /**
     * Handle device state changes
     */
    handleStateChange(event) {
        const port = event.port;
        const state = port.state;
        
        this.dispatchEvent(new CustomEvent('statechange', { 
            detail: { 
                name: port.name,
                state: state,
                type: port.type
            }
        }));

        // Refresh device list
        this.refreshDeviceList();
        
        // Check if current device was disconnected
        if (this.currentInput && this.currentInput.id === port.id && state === 'disconnected') {
            this.disconnect();
        }
    }

    /**
     * Refresh device list and notify listeners
     */
    refreshDeviceList() {
        const devices = this.getAvailableDevices();
        this.dispatchEvent(new CustomEvent('devicesChanged', { 
            detail: { devices }
        }));
    }

    /**
     * Convert message type to string
     */
    static getMsgTypeString(msgType) {
        switch (msgType) {
            case 0: return 'None';
            case 1: return 'CC';
            case 2: return 'PC';
            case 3: return 'Note';
            default: return 'Unknown';
        }
    }

    /**
     * Convert string to message type
     */
    static getMsgTypeValue(msgTypeString) {
        switch (msgTypeString.toUpperCase()) {
            case 'NONE': return 0;
            case 'CC': return 1;
            case 'PC': return 2;
            case 'NOTE': return 3;
            default: return 0;
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MidiManager;
}