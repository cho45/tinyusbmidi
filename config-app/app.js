import { createApp, ref, reactive, computed, onMounted, nextTick } from 'vue';
import MidiManager from './midi-manager.js';

createApp({
  setup() {
    // Reactive state
    const isConnected = ref(false);
    const selectedDeviceId = ref('');
    const availableDevices = ref([]);
    const webMidiStatus = ref('Checking...');
    const logEntries = ref([]);
    const fileInput = ref(null);
    const logContent = ref(null);

    // Configuration state
    const configurations = reactive({
      sw1Press: { msgType: 'CC', channel: 1, param1: 64, param2: 127 },
      sw1Release: { msgType: 'CC', channel: 1, param1: 64, param2: 0 },
      sw2Press: { msgType: 'PC', channel: 1, param1: 1, param2: 0 },
      sw2Release: { msgType: 'PC', channel: 1, param1: 0, param2: 0 }
    });

    const readConfiguration = ref(null); // デバイスから読み込んだ設定

    // MIDI Manager instance
    const midiManager = new MidiManager();

    // Computed properties
    const connectionStatusText = computed(() => {
      if (!isConnected.value) return 'Disconnected';
      const device = availableDevices.value.find(d => d.id === selectedDeviceId.value);
      return device ? `Connected: ${device.name}` : 'Connected';
    });

    // 設定比較の共通ロジック
    const isConfigChanged = (current, saved) => {
      if (!saved) return false; // まだ読み込んでいない場合は変更なし
      return current.msgType !== saved.msgType ||
             current.channel !== saved.channel ||
             current.param1 !== saved.param1 ||
             current.param2 !== saved.param2;
    };

    const hasChanges = computed(() => {
      if (!readConfiguration.value) return false;
      return Object.keys(configurations).some(key => 
        isConfigChanged(configurations[key], readConfiguration.value[key])
      );
    });

    // Helper functions
    const log = (message, type = 'info') => {
      const timestamp = new Date().toLocaleTimeString();
      logEntries.value.push({
        id: Date.now() + Math.random(),
        timestamp,
        message,
        type
      });
      
      // Limit log entries
      if (logEntries.value.length > 100) {
        logEntries.value.shift();
      }
      
      // Auto scroll
      nextTick(() => {
        if (logContent.value) {
          logContent.value.scrollTop = logContent.value.scrollHeight;
        }
      });
    };

    const hasConfigChanged = (configKey) => {
      if (!readConfiguration.value) return false;
      return isConfigChanged(configurations[configKey], readConfiguration.value[configKey]);
    };

    const getParam1Label = (msgType) => {
      switch (msgType) {
      case 'CC': return 'CC Number';
      case 'PC': return 'Program';
      case 'Note': return 'Note';
      default: return 'Parameter 1';
      }
    };

    const getParam2Label = (msgType) => {
      switch (msgType) {
      case 'CC': return 'Value';
      case 'Note': return 'Velocity';
      default: return 'Parameter 2';
      }
    };

    // Methods
    const refreshDevices = async () => {
      if (midiManager) {
        midiManager.refreshDeviceList();
      }
    };

    const handleConnect = async () => {
      if (!midiManager) return;

      if (isConnected.value) {
        // Disconnect
        removeLastConnectedDevice();
        midiManager.disconnect();
        readConfiguration.value = null;
      } else {
        // Connect
        if (!selectedDeviceId.value) {
          log('Please select a device', 'warning');
          return;
        }
        
        const connected = await midiManager.connectDevice(selectedDeviceId.value);
        if (connected) {
          const device = availableDevices.value.find(d => d.id === selectedDeviceId.value);
          if (device) {
            saveLastConnectedDevice(device.id, device.name);
          }
        }
      }
    };


    const writeToDevice = async () => {
      if (!isConnected.value || !midiManager) {
        log('No device connected', 'warning');
        return;
      }

      try {
        log('Writing configuration to device...', 'info');
        
        const configMappings = [
          { key: 'sw1Press', switchNum: 0, eventType: 0 },
          { key: 'sw1Release', switchNum: 0, eventType: 1 },
          { key: 'sw2Press', switchNum: 1, eventType: 0 },
          { key: 'sw2Release', switchNum: 1, eventType: 1 }
        ];

        for (const mapping of configMappings) {
          const config = configurations[mapping.key];
          const configData = {
            msgType: getMsgTypeValue(config.msgType),
            channel: config.channel - 1, // 1-based to 0-based
            param1: config.param1,
            param2: config.param2
          };
          
          await midiManager.sendConfiguration(
            mapping.switchNum,
            mapping.eventType,
            configData
          );
          
          // Small delay between messages
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        saveCurrentConfigAsRead();
        log('Configuration written successfully', 'success');
      } catch (error) {
        log(`Failed to write configuration: ${error.message}`, 'error');
      }
    };


    const saveToFile = () => {
      const config = {
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        configurations: { ...configurations }
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
      
      log('Configuration saved to file', 'success');
    };

    const loadFromFile = () => {
      fileInput.value?.click();
    };

    const handleFileLoad = (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const config = JSON.parse(e.target.result);
          
          if (!config.configurations) {
            throw new Error('Invalid configuration file');
          }

          Object.assign(configurations, config.configurations);
          saveCurrentConfigAsRead();
          log('Configuration loaded from file', 'success');
        } catch (error) {
          log(`Failed to load configuration: ${error.message}`, 'error');
        }
      };
      
      reader.readAsText(file);
      event.target.value = '';
    };

    const clearLog = () => {
      logEntries.value = [];
      log('Log cleared', 'info');
    };

    // Utility functions
    const getConfigKey = (switchNum, eventType) => {
      const switchName = switchNum === 0 ? 'sw1' : 'sw2';
      const eventName = eventType === 0 ? 'Press' : 'Release';
      return `${switchName}${eventName}`;
    };

    const getMsgTypeString = (msgType) => {
      switch (msgType) {
      case 0: return 'None';
      case 1: return 'CC';
      case 2: return 'PC';
      case 3: return 'Note';
      default: return 'None';
      }
    };

    const getMsgTypeValue = (msgTypeString) => {
      switch (msgTypeString.toUpperCase()) {
      case 'NONE': return 0;
      case 'CC': return 1;
      case 'PC': return 2;
      case 'NOTE': return 3;
      default: return 0;
      }
    };

    const saveCurrentConfigAsRead = () => {
      readConfiguration.value = JSON.parse(JSON.stringify(configurations));
    };

    // LocalStorage functions
    const saveLastConnectedDevice = (deviceId, deviceName) => {
      try {
        const deviceInfo = {
          id: deviceId,
          name: deviceName,
          timestamp: Date.now()
        };
        localStorage.setItem('midi-config-last-device', JSON.stringify(deviceInfo));
        log(`Device info saved: ${deviceName}`, 'info');
      } catch (error) {
        log(`Failed to save device info: ${error.message}`, 'error');
      }
    };

    const getLastConnectedDevice = () => {
      try {
        const stored = localStorage.getItem('midi-config-last-device');
        if (stored) {
          const deviceInfo = JSON.parse(stored);
          // 24時間以内のデバイス情報のみ有効
          if (Date.now() - deviceInfo.timestamp < 24 * 60 * 60 * 1000) {
            return deviceInfo;
          }
        }
      } catch (error) {
        log(`Failed to get device info: ${error.message}`, 'warning');
      }
      return null;
    };

    const removeLastConnectedDevice = () => {
      try {
        localStorage.removeItem('midi-config-last-device');
        log('Device info removed', 'info');
      } catch (error) {
        log(`Failed to remove device info: ${error.message}`, 'error');
      }
    };

    const tryAutoReconnect = async () => {
      try {
        // 既に接続されている場合はスキップ
        if (isConnected.value) {
          log('Device already connected, skipping auto-reconnect', 'info');
          return;
        }
        
        const lastDevice = getLastConnectedDevice();
        if (!lastDevice) {
          log('No previous device found', 'info');
          return;
        }

        log(`Attempting auto-reconnect: ${lastDevice.name}`, 'info');
        
        const targetDevice = availableDevices.value.find(device => 
          device.id === lastDevice.id || device.name === lastDevice.name
        );

        if (!targetDevice) {
          log(`Previous device not found: ${lastDevice.name}`, 'warning');
          return;
        }

        selectedDeviceId.value = targetDevice.id;
        
        const connected = await midiManager.connectDevice(targetDevice.id);
        if (connected) {
          log(`Auto-reconnect successful: ${targetDevice.name}`, 'success');
        } else {
          log(`Auto-reconnect failed: ${targetDevice.name}`, 'warning');
        }
      } catch (error) {
        log(`Auto-reconnect error: ${error.message}`, 'error');
      }
    };

    // Setup MIDI Manager
    const initializeMidiManager = async () => {
      if (!navigator.requestMIDIAccess) {
        webMidiStatus.value = 'Not Supported';
        log('WebMIDI API is not supported in this browser', 'error');
        return;
      }

      webMidiStatus.value = 'Supported';

      // Setup event listeners
      midiManager.addEventListener('connected', async (event) => {
        isConnected.value = true;
        log(`Connected to: ${event.detail.device}`, 'success');
        
        // Auto-read configuration after connection
        try {
          log('Auto-reading configuration from device...', 'info');
          const configs = await midiManager.requestConfiguration();
          
          // Apply configurations
          configs.forEach(config => {
            const configKey = getConfigKey(config.switchNum, config.eventType);
            if (configKey && configurations[configKey]) {
              configurations[configKey].msgType = getMsgTypeString(config.msgType);
              configurations[configKey].channel = config.channel + 1; // 0-based to 1-based
              configurations[configKey].param1 = config.param1;
              configurations[configKey].param2 = config.param2;
            }
          });
          
          // Save as read configuration
          saveCurrentConfigAsRead();
          log('Auto-configuration read completed', 'success');
        } catch (error) {
          log(`Auto-configuration read failed: ${error.message}`, 'warning');
        }
      });

      midiManager.addEventListener('disconnected', () => {
        isConnected.value = false;
        readConfiguration.value = null;
        log('Device disconnected', 'warning');
      });

      midiManager.addEventListener('error', (event) => {
        log(event.detail.message, 'error');
      });

      midiManager.addEventListener('devicesChanged', (event) => {
        availableDevices.value = event.detail.devices;
        
        // TinyUSB MIDI Footswitch デバイスを探して自動選択
        const tinyUsbDevice = event.detail.devices.find(device => 
          device.name === 'TinyUSB MIDI Footswitch'
        );
        
        if (tinyUsbDevice) {
          // まだ何も選択されていない、または異なるデバイスが選択されている場合
          if (!selectedDeviceId.value || selectedDeviceId.value !== tinyUsbDevice.id) {
            selectedDeviceId.value = tinyUsbDevice.id;
            log(`TinyUSB MIDI Footswitch auto-selected: ${tinyUsbDevice.name}`, 'info');
            
            // 未接続で、かつ既に同じデバイスに接続されていない場合のみ自動接続
            if (!isConnected.value) {
              log('Attempting auto-connect to TinyUSB MIDI Footswitch...', 'info');
              midiManager.connectDevice(tinyUsbDevice.id).then(connected => {
                if (connected) {
                  saveLastConnectedDevice(tinyUsbDevice.id, tinyUsbDevice.name);
                  log(`Auto-connect successful: ${tinyUsbDevice.name}`, 'success');
                } else {
                  log(`Auto-connect failed: ${tinyUsbDevice.name}`, 'warning');
                }
              });
            }
          }
        }
      });

      midiManager.addEventListener('sysexSent', (event) => {
        const hexString = event.detail.data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        log(`SysEx Sent: ${hexString}`, 'sysex');
      });

      midiManager.addEventListener('midiMessage', (event) => {
        const hexString = event.detail.data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        log(`MIDI Received: ${hexString}`, 'sysex');
      });

      midiManager.addEventListener('configReceived', (event) => {
        log(`Config received: Switch ${event.detail.switchNum + 1} ${event.detail.eventType === 0 ? 'Press' : 'Release'}`, 'info');
      });

      // Initialize MIDI
      const initialized = await midiManager.initialize();
      if (initialized) {
        log('WebMIDI initialized successfully', 'success');
        refreshDevices();
        await tryAutoReconnect();
      } else {
        log('Failed to initialize WebMIDI', 'error');
      }
    };

    // Lifecycle
    onMounted(() => {
      initializeMidiManager();
    });

    return {
      // State
      isConnected,
      selectedDeviceId,
      availableDevices,
      webMidiStatus,
      logEntries,
      configurations,
      readConfiguration,
      fileInput,
      logContent,
      
      // Computed
      connectionStatusText,
      hasChanges,
      
      // Methods
      refreshDevices,
      handleConnect,
      writeToDevice,
      saveToFile,
      loadFromFile,
      handleFileLoad,
      clearLog,
      hasConfigChanged,
      getParam1Label,
      getParam2Label
    };
  }
}).mount('#app');