/**
 * Main Application Controller
 * Manages UI interactions and coordinates with MidiManager
 */

class Application {
    constructor() {
        this.midiManager = new MidiManager();
        this.currentConfig = this.getDefaultConfig();
        this.isConnected = false;
        
        // Initialize on DOM ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }

    /**
     * Initialize the application
     */
    async initialize() {
        this.bindElements();
        this.attachEventListeners();
        this.setupMidiEventHandlers();
        this.updateMessageTypeLabels();
        
        // Check WebMIDI support
        if (!navigator.requestMIDIAccess) {
            this.updateWebMidiStatus('Not Supported');
            this.log('WebMIDI API is not supported in this browser', 'error');
            this.disableAllControls();
            return;
        }
        
        this.updateWebMidiStatus('Supported');
        
        // Initialize MIDI Manager
        const initialized = await this.midiManager.initialize();
        if (initialized) {
            this.log('WebMIDI initialized successfully', 'success');
            this.refreshDeviceList();
        } else {
            this.log('Failed to initialize WebMIDI', 'error');
        }
    }

    /**
     * Bind DOM elements
     */
    bindElements() {
        // Device controls
        this.deviceSelect = document.getElementById('deviceSelect');
        this.connectBtn = document.getElementById('connectBtn');
        this.refreshBtn = document.getElementById('refreshBtn');
        
        // Configuration controls
        this.readConfigBtn = document.getElementById('readConfigBtn');
        this.writeConfigBtn = document.getElementById('writeConfigBtn');
        this.resetDefaultBtn = document.getElementById('resetDefaultBtn');
        this.saveLocalBtn = document.getElementById('saveLocalBtn');
        this.loadLocalBtn = document.getElementById('loadLocalBtn');
        this.fileInput = document.getElementById('fileInput');
        
        // Log controls
        this.clearLogBtn = document.getElementById('clearLogBtn');
        this.logContent = document.getElementById('logContent');
        
        // Status elements
        this.connectionStatus = document.getElementById('connectionStatus');
        this.webmidiStatus = document.getElementById('webmidiStatus');
        
        // Configuration form elements
        this.configElements = {
            'sw1-press': {
                type: document.getElementById('sw1-press-type'),
                channel: document.getElementById('sw1-press-channel'),
                param1: document.getElementById('sw1-press-param1'),
                param2: document.getElementById('sw1-press-param2'),
                param1Label: document.getElementById('sw1-press-param1-label'),
                param2Label: document.getElementById('sw1-press-param2-label'),
                param1Row: document.getElementById('sw1-press-param1-row'),
                param2Row: document.getElementById('sw1-press-param2-row')
            },
            'sw1-release': {
                type: document.getElementById('sw1-release-type'),
                channel: document.getElementById('sw1-release-channel'),
                param1: document.getElementById('sw1-release-param1'),
                param2: document.getElementById('sw1-release-param2'),
                param1Label: document.getElementById('sw1-release-param1-label'),
                param2Label: document.getElementById('sw1-release-param2-label'),
                param1Row: document.getElementById('sw1-release-param1-row'),
                param2Row: document.getElementById('sw1-release-param2-row')
            },
            'sw2-press': {
                type: document.getElementById('sw2-press-type'),
                channel: document.getElementById('sw2-press-channel'),
                param1: document.getElementById('sw2-press-param1'),
                param2: document.getElementById('sw2-press-param2'),
                param1Label: document.getElementById('sw2-press-param1-label'),
                param2Label: document.getElementById('sw2-press-param2-label'),
                param1Row: document.getElementById('sw2-press-param1-row'),
                param2Row: document.getElementById('sw2-press-param2-row')
            },
            'sw2-release': {
                type: document.getElementById('sw2-release-type'),
                channel: document.getElementById('sw2-release-channel'),
                param1: document.getElementById('sw2-release-param1'),
                param2: document.getElementById('sw2-release-param2'),
                param1Label: document.getElementById('sw2-release-param1-label'),
                param2Label: document.getElementById('sw2-release-param2-label'),
                param1Row: document.getElementById('sw2-release-param1-row'),
                param2Row: document.getElementById('sw2-release-param2-row')
            }
        };
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Device controls
        this.connectBtn.addEventListener('click', () => this.handleConnect());
        this.refreshBtn.addEventListener('click', () => this.refreshDeviceList());
        
        // Configuration controls
        this.readConfigBtn.addEventListener('click', () => this.handleReadConfig());
        this.writeConfigBtn.addEventListener('click', () => this.handleWriteConfig());
        this.resetDefaultBtn.addEventListener('click', () => this.handleResetDefault());
        this.saveLocalBtn.addEventListener('click', () => this.handleSaveLocal());
        this.loadLocalBtn.addEventListener('click', () => this.handleLoadLocal());
        this.fileInput.addEventListener('change', (e) => this.handleFileLoad(e));
        
        // Log controls
        this.clearLogBtn.addEventListener('click', () => this.clearLog());
        
        // Message type change handlers
        Object.keys(this.configElements).forEach(key => {
            const element = this.configElements[key];
            element.type.addEventListener('change', () => {
                this.updateMessageTypeLabel(key);
            });
        });
    }

    /**
     * Setup MIDI event handlers
     */
    setupMidiEventHandlers() {
        this.midiManager.addEventListener('connected', (event) => {
            this.isConnected = true;
            this.updateConnectionStatus(true, event.detail.device);
            this.log(`Connected to: ${event.detail.device}`, 'success');
            this.enableConfigControls();
        });

        this.midiManager.addEventListener('disconnected', () => {
            this.isConnected = false;
            this.updateConnectionStatus(false);
            this.log('Device disconnected', 'warning');
            this.disableConfigControls();
        });

        this.midiManager.addEventListener('error', (event) => {
            this.log(event.detail.message, 'error');
        });

        this.midiManager.addEventListener('devicesChanged', (event) => {
            this.updateDeviceList(event.detail.devices);
        });

        this.midiManager.addEventListener('sysexSent', (event) => {
            const hexString = event.detail.data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
            this.log(`SysEx Sent: ${hexString}`, 'sysex');
        });

        this.midiManager.addEventListener('midiMessage', (event) => {
            const hexString = event.detail.data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
            this.log(`MIDI Received: ${hexString}`, 'sysex');
        });

        this.midiManager.addEventListener('configReceived', (event) => {
            this.log(`Config received: Switch ${event.detail.switchNum + 1} ${event.detail.eventType === 0 ? 'Press' : 'Release'}`, 'info');
        });

        this.midiManager.addEventListener('statechange', (event) => {
            this.log(`Device ${event.detail.name} ${event.detail.state}`, 'info');
        });
    }

    /**
     * Handle connect button click
     */
    async handleConnect() {
        if (this.isConnected) {
            this.midiManager.disconnect();
        } else {
            const selectedDevice = this.deviceSelect.value;
            if (!selectedDevice) {
                this.log('Please select a device', 'warning');
                return;
            }
            
            const connected = await this.midiManager.connectDevice(selectedDevice);
            if (connected) {
                this.connectBtn.textContent = 'Disconnect';
            }
        }
    }

    /**
     * Handle read configuration
     */
    async handleReadConfig() {
        if (!this.isConnected) {
            this.log('No device connected', 'warning');
            return;
        }

        try {
            this.log('Reading configuration from device...', 'info');
            const configs = await this.midiManager.requestConfiguration();
            
            // Parse and apply configurations
            configs.forEach(config => {
                const configKey = this.getConfigKey(config.switchNum, config.eventType);
                if (configKey) {
                    this.applyConfigToUI(configKey, config);
                }
            });
            
            this.log('Configuration read successfully', 'success');
        } catch (error) {
            this.log(`Failed to read configuration: ${error.message}`, 'error');
        }
    }

    /**
     * Handle write configuration
     */
    async handleWriteConfig() {
        if (!this.isConnected) {
            this.log('No device connected', 'warning');
            return;
        }

        try {
            this.log('Writing configuration to device...', 'info');
            
            // Write all 4 configurations
            const configs = [
                { key: 'sw1-press', switchNum: 0, eventType: 0 },
                { key: 'sw1-release', switchNum: 0, eventType: 1 },
                { key: 'sw2-press', switchNum: 1, eventType: 0 },
                { key: 'sw2-release', switchNum: 1, eventType: 1 }
            ];

            for (const config of configs) {
                const configData = this.getConfigFromUI(config.key);
                await this.midiManager.sendConfiguration(
                    config.switchNum,
                    config.eventType,
                    configData
                );
                // Small delay between messages
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            this.log('Configuration written successfully', 'success');
        } catch (error) {
            this.log(`Failed to write configuration: ${error.message}`, 'error');
        }
    }

    /**
     * Handle reset to default
     */
    handleResetDefault() {
        const defaultConfig = this.getDefaultConfig();
        
        // Apply default configuration to UI
        this.applyConfigToUI('sw1-press', {
            msgType: 0, channel: 0, param1: 64, param2: 127
        });
        this.applyConfigToUI('sw1-release', {
            msgType: 0, channel: 0, param1: 64, param2: 0
        });
        this.applyConfigToUI('sw2-press', {
            msgType: 1, channel: 0, param1: 1, param2: 0
        });
        this.applyConfigToUI('sw2-release', {
            msgType: 1, channel: 0, param1: 0, param2: 0
        });
        
        this.updateMessageTypeLabels();
        this.log('Reset to default configuration', 'info');
    }

    /**
     * Handle save to local file
     */
    handleSaveLocal() {
        const config = {
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            configurations: {
                'sw1-press': this.getConfigFromUI('sw1-press'),
                'sw1-release': this.getConfigFromUI('sw1-release'),
                'sw2-press': this.getConfigFromUI('sw2-press'),
                'sw2-release': this.getConfigFromUI('sw2-release')
            }
        };

        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `midi-config-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.log('Configuration saved to file', 'success');
    }

    /**
     * Handle load from local file
     */
    handleLoadLocal() {
        this.fileInput.click();
    }

    /**
     * Handle file load
     */
    handleFileLoad(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const config = JSON.parse(e.target.result);
                
                // Validate configuration
                if (!config.configurations) {
                    throw new Error('Invalid configuration file');
                }

                // Apply configurations to UI
                Object.keys(config.configurations).forEach(key => {
                    if (this.configElements[key]) {
                        this.applyConfigToUI(key, config.configurations[key]);
                    }
                });

                this.updateMessageTypeLabels();
                this.log('Configuration loaded from file', 'success');
            } catch (error) {
                this.log(`Failed to load configuration: ${error.message}`, 'error');
            }
        };
        
        reader.readAsText(file);
        // Reset file input
        event.target.value = '';
    }

    /**
     * Get configuration from UI
     */
    getConfigFromUI(key) {
        const elements = this.configElements[key];
        return {
            msgType: MidiManager.getMsgTypeValue(elements.type.value),
            channel: parseInt(elements.channel.value) - 1, // Convert to 0-based
            param1: parseInt(elements.param1.value),
            param2: parseInt(elements.param2.value)
        };
    }

    /**
     * Apply configuration to UI
     */
    applyConfigToUI(key, config) {
        const elements = this.configElements[key];
        if (!elements) return;

        elements.type.value = MidiManager.getMsgTypeString(config.msgType);
        elements.channel.value = (config.channel + 1).toString(); // Convert to 1-based
        elements.param1.value = config.param1.toString();
        elements.param2.value = config.param2.toString();
        
        this.updateMessageTypeLabel(key);
    }

    /**
     * Get config key from switch and event
     */
    getConfigKey(switchNum, eventType) {
        const switchName = switchNum === 0 ? 'sw1' : 'sw2';
        const eventName = eventType === 0 ? 'press' : 'release';
        return `${switchName}-${eventName}`;
    }

    /**
     * Update message type labels
     */
    updateMessageTypeLabels() {
        Object.keys(this.configElements).forEach(key => {
            this.updateMessageTypeLabel(key);
        });
    }

    /**
     * Update message type label for a specific config
     */
    updateMessageTypeLabel(key) {
        const elements = this.configElements[key];
        const msgType = elements.type.value;

        switch (msgType) {
            case 'None':
                elements.param1Label.textContent = 'Parameter 1:';
                elements.param2Label.textContent = 'Parameter 2:';
                elements.param1Row.style.display = 'none';
                elements.param2Row.style.display = 'none';
                break;
            case 'CC':
                elements.param1Label.textContent = 'CC Number:';
                elements.param2Label.textContent = 'Value:';
                elements.param1Row.style.display = 'flex';
                elements.param2Row.style.display = 'flex';
                break;
            case 'PC':
                elements.param1Label.textContent = 'Program:';
                elements.param1Row.style.display = 'flex';
                elements.param2Row.style.display = 'none';
                break;
            case 'Note':
                elements.param1Label.textContent = 'Note:';
                elements.param2Label.textContent = 'Velocity:';
                elements.param1Row.style.display = 'flex';
                elements.param2Row.style.display = 'flex';
                break;
        }
    }

    /**
     * Refresh device list
     */
    refreshDeviceList() {
        const devices = this.midiManager.getAvailableDevices();
        this.updateDeviceList(devices);
    }

    /**
     * Update device list in UI
     */
    updateDeviceList(devices) {
        // Clear current options
        this.deviceSelect.innerHTML = '<option value="">Select a MIDI device...</option>';
        
        // Add device options
        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.id;
            option.textContent = device.name;
            if (device.manufacturer) {
                option.textContent += ` (${device.manufacturer})`;
            }
            this.deviceSelect.appendChild(option);
        });

        // If no devices found
        if (devices.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No MIDI devices found';
            option.disabled = true;
            this.deviceSelect.appendChild(option);
        }
    }

    /**
     * Update connection status
     */
    updateConnectionStatus(connected, deviceName = '') {
        const statusText = this.connectionStatus.querySelector('.status-text');
        if (connected) {
            this.connectionStatus.classList.add('connected');
            statusText.textContent = `Connected: ${deviceName}`;
            this.connectBtn.textContent = 'Disconnect';
        } else {
            this.connectionStatus.classList.remove('connected');
            statusText.textContent = 'Disconnected';
            this.connectBtn.textContent = 'Connect';
        }
    }

    /**
     * Update WebMIDI status
     */
    updateWebMidiStatus(status) {
        this.webmidiStatus.textContent = status;
    }

    /**
     * Enable configuration controls
     */
    enableConfigControls() {
        this.readConfigBtn.disabled = false;
        this.writeConfigBtn.disabled = false;
    }

    /**
     * Disable configuration controls
     */
    disableConfigControls() {
        this.readConfigBtn.disabled = true;
        this.writeConfigBtn.disabled = true;
    }

    /**
     * Disable all controls
     */
    disableAllControls() {
        this.connectBtn.disabled = true;
        this.refreshBtn.disabled = true;
        this.readConfigBtn.disabled = true;
        this.writeConfigBtn.disabled = true;
        this.deviceSelect.disabled = true;
    }

    /**
     * Log a message
     */
    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> ${this.escapeHtml(message)}`;
        
        this.logContent.appendChild(entry);
        // Auto-scroll to bottom
        this.logContent.scrollTop = this.logContent.scrollHeight;
        
        // Limit log entries to 100
        while (this.logContent.children.length > 100) {
            this.logContent.removeChild(this.logContent.firstChild);
        }
    }

    /**
     * Clear log
     */
    clearLog() {
        this.logContent.innerHTML = '';
        this.log('Log cleared', 'info');
    }

    /**
     * Escape HTML for safe display
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Get default configuration
     */
    getDefaultConfig() {
        return {
            'sw1-press': { msgType: 0, channel: 0, param1: 64, param2: 127 },
            'sw1-release': { msgType: 0, channel: 0, param1: 64, param2: 0 },
            'sw2-press': { msgType: 1, channel: 0, param1: 1, param2: 0 },
            'sw2-release': { msgType: 1, channel: 0, param1: 0, param2: 0 }
        };
    }
}

// Initialize application
const app = new Application();