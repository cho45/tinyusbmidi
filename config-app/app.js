import { createApp, ref, reactive, computed, onMounted, nextTick } from 'vue';
import MidiManager from './midi-manager.js';

createApp({
  setup() {
    // Reactive state
    const isConnected = ref(false);
    const isLoading = ref(false);
    const selectedDeviceId = ref('');
    const availableDevices = ref([]);
    const webMidiStatus = ref('Checking...');
    const logEntries = ref([]);
    const fileInput = ref(null);
    const logContent = ref(null);
    
    // Device info
    const deviceInfo = ref(null); // {numSwitches, version}
    const switchConfigurations = ref([]); // Array of switch configurations
    const savedConfigurations = ref([]); // デバイスから読み込んだ設定

    // MIDI Manager instance
    const midiManager = new MidiManager();

    // Computed properties
    const connectionStatusText = computed(() => {
      if (!isConnected.value) return 'Disconnected';
      if (isLoading.value) return 'Loading configurations...';
      const device = availableDevices.value.find(d => d.id === selectedDeviceId.value);
      const info = deviceInfo.value ? ` (${deviceInfo.value.numSwitches} switches, v${deviceInfo.value.version})` : '';
      return device ? `Connected: ${device.name}${info}` : 'Connected';
    });

    // 設定比較の共通ロジック
    const isMessagesChanged = (current, saved) => {
      console.log('isMessagesChanged:', Array.from(current), Array.from(saved));
      if (!saved || saved.length === 0) {
        const result = current.length > 0;
        console.log('  no saved or empty saved, result:', result);
        return result;
      }
      if (current.length !== saved.length) {
        console.log('  length different:', current.length, 'vs', saved.length);
        return true;
      }
      
      for (let i = 0; i < current.length; i++) {
        const curr = current[i];
        const save = saved[i];
        if (curr.msgType !== save.msgType ||
            curr.channel !== save.channel ||
            curr.param1 !== save.param1 ||
            curr.param2 !== save.param2) {
          console.log('  message different at index', i, ':', curr, 'vs', save);
          return true;
        }
      }
      console.log('  no changes detected');
      return false;
    };

    const hasChanges = computed(() => {
      if (!switchConfigurations.value.length) return false;
      
      for (let switchIdx = 0; switchIdx < switchConfigurations.value.length; switchIdx++) {
        const switchConfig = switchConfigurations.value[switchIdx];
        const savedConfig = savedConfigurations.value[switchIdx];
        
        if (isMessagesChanged(switchConfig.press.messages, savedConfig?.press?.messages) ||
            isMessagesChanged(switchConfig.release.messages, savedConfig?.release?.messages)) {
          return true;
        }
      }
      return false;
    });

    // 個別のスイッチ/イベントの変更状態をチェック
    const isEventChanged = (switchIdx, eventType) => {
      if (switchIdx >= switchConfigurations.value.length) return false;
      
      const switchConfig = switchConfigurations.value[switchIdx];
      const savedConfig = savedConfigurations.value[switchIdx];
      const event = eventType === 'press' ? switchConfig.press : switchConfig.release;
      const savedEvent = savedConfig?.[eventType];
      
      return isMessagesChanged(event.messages, savedEvent?.messages);
    };

    // スイッチ全体の変更状態をチェック
    const isSwitchChanged = (switchIdx) => {
      return isEventChanged(switchIdx, 'press') || isEventChanged(switchIdx, 'release');
    };

    // Helper functions
    const log = (message, type = 'info') => {
      const timestamp = new Date().toLocaleTimeString();
      logEntries.value.push({
        id: Date.now() + Math.random(),
        timestamp,
        message,
        type
      });
      
      // Auto-scroll to bottom
      nextTick(() => {
        if (logContent.value) {
          logContent.value.scrollTop = logContent.value.scrollHeight;
        }
      });
    };

    // スイッチ設定の初期化
    const initializeSwitchConfigurations = (numSwitches) => {
      switchConfigurations.value = [];
      savedConfigurations.value = [];
      
      for (let i = 0; i < numSwitches; i++) {
        // 各スイッチの初期設定
        switchConfigurations.value.push({
          press: {
            messages: [
              { msgType: 1, channel: 0, param1: i, param2: 127 } // デフォルトCC
            ]
          },
          release: {
            messages: [
              { msgType: 1, channel: 0, param1: i, param2: 0 } // デフォルトCC
            ]
          }
        });
        
        // 保存済み設定の初期化
        savedConfigurations.value.push({
          press: { messages: [] },
          release: { messages: [] }
        });
      }
    };

    // メッセージタイプの表示名取得
    const getMessageTypeName = (msgType) => {
      const types = { 0: 'None', 1: 'CC', 2: 'PC', 3: 'Note' };
      return types[msgType] || 'Unknown';
    };

    // メッセージの表示文字列生成
    const formatMessage = (msg) => {
      const typeName = getMessageTypeName(msg.msgType);
      if (msg.msgType === 2) { // PC
        return `${typeName} Ch${msg.channel + 1}: ${msg.param1}`;
      } else if (msg.msgType === 3) { // Note
        return `${typeName} Ch${msg.channel + 1}: ${msg.param1} Vel${msg.param2}`;
      } else { // CC
        return `${typeName} Ch${msg.channel + 1}: ${msg.param1}=${msg.param2}`;
      }
    };

    // メッセージ追加
    const addMessage = (switchIdx, eventType) => {
      const switchConfig = switchConfigurations.value[switchIdx];
      const event = eventType === 'press' ? switchConfig.press : switchConfig.release;
      
      if (event.messages.length >= 10) {
        log('Maximum 10 messages per event', 'error');
        return;
      }
      
      event.messages.push({
        msgType: 1, // CC
        channel: 0,
        param1: 0,
        param2: 127
      });
    };

    // メッセージ削除
    const removeMessage = (switchIdx, eventType, messageIdx) => {
      const switchConfig = switchConfigurations.value[switchIdx];
      const event = eventType === 'press' ? switchConfig.press : switchConfig.release;
      
      if (event.messages.length > 1) {
        event.messages.splice(messageIdx, 1);
      } else {
        log('At least one message is required', 'warning');
      }
    };

    // Event handlers
    const connectToDevice = async () => {
      if (!selectedDeviceId.value) {
        log('Please select a device first', 'error');
        return;
      }

      log(`Connecting to device...`);
      const success = await midiManager.connectToDevice(selectedDeviceId.value);
      
      if (success) {
        log(`Connected successfully`, 'success');
        isConnected.value = true;
        await loadAllConfigurations();
      } else {
        log('Failed to connect', 'error');
      }
    };

    const disconnectDevice = () => {
      log('Disconnecting...');
      midiManager.disconnect();
      isConnected.value = false;
      isLoading.value = false;
      deviceInfo.value = null;
      switchConfigurations.value = [];
      savedConfigurations.value = [];
      log('Disconnected', 'success');
    };

    // 全設定の読み込み
    const loadAllConfigurations = async () => {
      if (!isConnected.value || !deviceInfo.value) return;
      
      isLoading.value = true;
      log('Loading all configurations...');
      
      try {
        for (let switchIdx = 0; switchIdx < deviceInfo.value.numSwitches; switchIdx++) {
          // Press設定取得
          const pressConfig = await midiManager.getMessages(switchIdx, 0);
          savedConfigurations.value[switchIdx].press.messages = JSON.parse(JSON.stringify(pressConfig.messages));
          switchConfigurations.value[switchIdx].press.messages = JSON.parse(JSON.stringify(pressConfig.messages));
          
          // Release設定取得
          const releaseConfig = await midiManager.getMessages(switchIdx, 1);
          savedConfigurations.value[switchIdx].release.messages = JSON.parse(JSON.stringify(releaseConfig.messages));
          switchConfigurations.value[switchIdx].release.messages = JSON.parse(JSON.stringify(releaseConfig.messages));
          
          log(`Loaded Switch ${switchIdx} configuration`);
        }
        
        log('All configurations loaded successfully', 'success');
      } catch (error) {
        log(`Failed to load configurations: ${error.message}`, 'error');
      } finally {
        isLoading.value = false;
      }
    };

    // 設定の保存
    const saveConfiguration = async (switchIdx, eventType) => {
      if (!isConnected.value) {
        log('Device not connected', 'error');
        return;
      }

      const switchConfig = switchConfigurations.value[switchIdx];
      const event = eventType === 'press' ? switchConfig.press : switchConfig.release;
      const eventNum = eventType === 'press' ? 0 : 1;

      log(`Saving Switch ${switchIdx} ${eventType} configuration...`);

      try {
        await midiManager.setMessages(switchIdx, eventNum, event.messages);
        
        // 保存した設定をsavedに反映（ディープコピー）
        savedConfigurations.value[switchIdx][eventType].messages = JSON.parse(JSON.stringify(event.messages));
        
        log(`Switch ${switchIdx} ${eventType} configuration saved successfully`, 'success');
      } catch (error) {
        log(`Failed to save configuration: ${error.message}`, 'error');
      }
    };

    // 全設定の保存
    const saveAllConfigurations = async () => {
      if (!isConnected.value) {
        log('Device not connected', 'error');
        return;
      }

      log('Saving all configurations...');
      
      try {
        for (let switchIdx = 0; switchIdx < switchConfigurations.value.length; switchIdx++) {
          await saveConfiguration(switchIdx, 'press');
          await saveConfiguration(switchIdx, 'release');
        }
        
        log('All configurations saved successfully', 'success');
      } catch (error) {
        log(`Failed to save all configurations: ${error.message}`, 'error');
      }
    };

    // 設定をファイルに保存
    const saveToFile = () => {
      const config = {
        deviceInfo: deviceInfo.value,
        configurations: switchConfigurations.value
      };
      
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tinyusbmidi-config.json';
      a.click();
      URL.revokeObjectURL(url);
      
      log('Configuration saved to file', 'success');
    };

    // ファイルから設定を読み込み
    const loadFromFile = (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const config = JSON.parse(e.target.result);
          
          if (config.deviceInfo && config.configurations) {
            switchConfigurations.value = config.configurations;
            log(`Configuration loaded from file`, 'success');
          } else {
            throw new Error('Invalid configuration file format');
          }
        } catch (error) {
          log(`Failed to load configuration: ${error.message}`, 'error');
        }
      };
      
      reader.readAsText(file);
    };

    // Event listeners setup
    const setupEventListeners = () => {
      // WebMIDI events
      midiManager.addEventListener('devicesChanged', (event) => {
        console.log("devicesChanged event received:", event.detail.devices);
        availableDevices.value = event.detail.devices;
        console.log("availableDevices.value updated:", availableDevices.value);
        
        // 自動接続: TinyUSB MIDI Footswitch を探して自動接続
        if (!isConnected.value && !selectedDeviceId.value) {
          const targetDevice = availableDevices.value.find(device => 
            device.name.includes('TinyUSB MIDI Footswitch'));
          
          if (targetDevice) {
            log(`Found TinyUSB MIDI Footswitch, attempting auto-connect...`);
            selectedDeviceId.value = targetDevice.id;
            connectToDevice();
          }
        }
      });

      midiManager.addEventListener('connected', (event) => {
        deviceInfo.value = event.detail.deviceInfo;
        initializeSwitchConfigurations(deviceInfo.value.numSwitches);
        log(`Connected to ${event.detail.device} (${deviceInfo.value.numSwitches} switches)`, 'success');
      });

      midiManager.addEventListener('disconnected', () => {
        isConnected.value = false;
        isLoading.value = false;
        deviceInfo.value = null;
        switchConfigurations.value = [];
        savedConfigurations.value = [];
        log('Device disconnected', 'warning');
      });

      midiManager.addEventListener('error', (event) => {
        log(event.detail.message, 'error');
      });

      midiManager.addEventListener('midiMessage', (event) => {
        const data = event.detail.data;
        log(`MIDI: [${data.map(b => b.toString(16).padStart(2, '0')).join(' ')}]`, 'midi');
      });

      midiManager.addEventListener('sysexSent', (event) => {
        const data = event.detail.data;
        log(`TX: [${data.map(b => b.toString(16).padStart(2, '0')).join(' ')}]`, 'sysex');
      });
    };

    // Initialize
    const initialize = async () => {
      log('Initializing WebMIDI...');
      
      const success = await midiManager.initialize();
      
      if (success) {
        webMidiStatus.value = 'WebMIDI API initialized successfully';
        log('WebMIDI API initialized', 'success');
        setupEventListeners();
        // イベントリスナー設定後にデバイスリストを再取得
        midiManager.refreshDeviceList();
      } else {
        webMidiStatus.value = 'Failed to initialize WebMIDI API';
        log('Failed to initialize WebMIDI API', 'error');
      }
    };

    onMounted(() => {
      initialize();
    });

    return {
      // State
      isConnected,
      isLoading,
      selectedDeviceId,
      availableDevices,
      webMidiStatus,
      logEntries,
      fileInput,
      logContent,
      deviceInfo,
      switchConfigurations,
      savedConfigurations,
      
      // Computed
      connectionStatusText,
      hasChanges,
      
      // Methods
      connectToDevice,
      disconnectDevice,
      loadAllConfigurations,
      saveConfiguration,
      saveAllConfigurations,
      saveToFile,
      loadFromFile,
      addMessage,
      removeMessage,
      formatMessage,
      getMessageTypeName,
      isEventChanged,
      isSwitchChanged,
      log
    };
  }
}).mount('#app');
