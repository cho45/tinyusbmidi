/**
 * MIDI Manager - WebMIDI API wrapper and SysEx protocol implementation
 * Handles all MIDI device communication for PicoMIDI Switch (Multi-Switch/Multi-Message Version)
 */

// 新しいSysEx Protocol Constants
const SYSEX_CMD_GET_INFO = 0x01;      // スイッチ数やバージョンを返す
const SYSEX_CMD_GET_MESSAGE = 0x02;   // 特定のスイッチの設定を取得
const SYSEX_CMD_SET_MESSAGE = 0x03;   // 特定のスイッチの設定をセット

class MidiManager extends EventTarget {
  constructor() {
    super();
    this.midiAccess = null;
    this.currentInput = null;
    this.currentOutput = null;
    this.isConnected = false;
    this.responseTimeout = 2000; // 2 seconds timeout for responses
    this.pendingResponses = new Map();
    this.deviceInfo = null; // {numSwitches, version}
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
    
    if (this.midiAccess) {
      for (let input of this.midiAccess.inputs.values()) {
        if (input.state === 'connected') {
          devices.push({
            id: input.id,
            name: input.name,
            manufacturer: input.manufacturer,
            type: 'input'
          });
        }
      }
    }
    
    return devices;
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
   * Handle MIDI state changes
   */
  handleStateChange(event) {
    this.refreshDeviceList();
    
    if (event.port.state === 'disconnected' && 
        (event.port === this.currentInput || event.port === this.currentOutput)) {
      this.disconnect();
    }
  }

  /**
   * Connect to a specific device by ID
   */
  async connectToDevice(deviceId) {
    try {
      const input = this.midiAccess.inputs.get(deviceId);
      
      if (!input) {
        throw new Error('Input device not found');
      }

      // 同じ名前の出力デバイスを探す
      let output = null;
      for (let out of this.midiAccess.outputs.values()) {
        if (out.name === input.name && out.state === 'connected') {
          output = out;
          break;
        }
      }

      if (!output) {
        throw new Error('Corresponding output device not found');
      }

      this.currentInput = input;
      this.currentOutput = output;
      
      this.currentInput.onmidimessage = (event) => {
        this.handleMidiMessage(event);
      };

      this.isConnected = true;
            
      // デバイス情報を取得
      this.deviceInfo = await this.getDeviceInfo();
      
      this.dispatchEvent(new CustomEvent('connected', { 
        detail: { device: input.name, deviceInfo: this.deviceInfo }
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
    this.deviceInfo = null;
    this.pendingResponses.clear();
        
    this.dispatchEvent(new CustomEvent('disconnected'));
  }

  /**
   * デバイス情報を取得
   */
  async getDeviceInfo() {
    if (!this.isConnected || !this.currentOutput) {
      throw new Error('No device connected');
    }

    const sysexData = [
      0xF0, 0x00, 0x7D, 0x01,  // SysEx header
      SYSEX_CMD_GET_INFO,      // Get Info command
      0xF7                     // SysEx end
    ];

    const responsePromise = this.createResponsePromise('info');

    try {
      this.currentOutput.send(sysexData);
      
      this.dispatchEvent(new CustomEvent('sysexSent', { 
        detail: { message: 'Device info request sent', data: sysexData }
      }));

      return await responsePromise;
    } catch (error) {
      this.dispatchEvent(new CustomEvent('error', { 
        detail: { message: `Failed to get device info: ${error.message}` }
      }));
      throw error;
    }
  }

  /**
   * 特定のスイッチ/イベントの設定を取得
   */
  async getMessages(switchNum, eventType) {
    if (!this.isConnected || !this.currentOutput) {
      throw new Error('No device connected');
    }

    const sysexData = [
      0xF0, 0x00, 0x7D, 0x01,      // SysEx header
      SYSEX_CMD_GET_MESSAGE,       // Get Message command
      switchNum & 0x7F,            // スイッチ番号
      eventType & 0x7F,            // イベント種別
      0xF7                         // SysEx end
    ];

    const responseKey = `message_${switchNum}_${eventType}`;
    const responsePromise = this.createResponsePromise(responseKey);

    try {
      this.currentOutput.send(sysexData);
      
      this.dispatchEvent(new CustomEvent('sysexSent', { 
        detail: { 
          message: `Message request sent for Switch ${switchNum} Event ${eventType}`,
          data: sysexData 
        }
      }));

      return await responsePromise;
    } catch (error) {
      this.dispatchEvent(new CustomEvent('error', { 
        detail: { message: `Failed to get messages: ${error.message}` }
      }));
      throw error;
    }
  }

  /**
   * 特定のスイッチ/イベントに複数のメッセージを設定
   */
  async setMessages(switchNum, eventType, messages) {
    if (!this.isConnected || !this.currentOutput) {
      throw new Error('No device connected');
    }

    if (messages.length > 10) {
      throw new Error('Maximum 10 messages per event');
    }

    const sysexData = [
      0xF0, 0x00, 0x7D, 0x01,    // SysEx header
      SYSEX_CMD_SET_MESSAGE,     // Set Message command
      switchNum & 0x7F,          // スイッチ番号
      eventType & 0x7F,          // イベント種別
      messages.length & 0x7F     // メッセージ数
    ];

    // 各メッセージのデータを追加
    for (const msg of messages) {
      sysexData.push(
        msg.msgType & 0x7F,
        msg.channel & 0x7F,
        msg.param1 & 0x7F,
        msg.param2 & 0x7F
      );
    }

    sysexData.push(0xF7);  // SysEx end

    const responseKey = `set_${switchNum}_${eventType}`;
    const responsePromise = this.createResponsePromise(responseKey);

    try {
      this.currentOutput.send(sysexData);
      
      this.dispatchEvent(new CustomEvent('sysexSent', { 
        detail: { 
          message: `Set messages sent for Switch ${switchNum} Event ${eventType}`,
          data: sysexData 
        }
      }));

      return await responsePromise;
    } catch (error) {
      this.dispatchEvent(new CustomEvent('error', { 
        detail: { message: `Failed to set messages: ${error.message}` }
      }));
      throw error;
    }
  }

  /**
   * レスポンス待機Promise作成
   */
  createResponsePromise(key) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingResponses.delete(key);
        reject(new Error('Response timeout'));
      }, this.responseTimeout);

      this.pendingResponses.set(key, {
        resolve: (data) => {
          clearTimeout(timeoutId);
          this.pendingResponses.delete(key);
          resolve(data);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          this.pendingResponses.delete(key);
          reject(error);
        }
      });
    });
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
    if (data.length < 6 || data[data.length - 1] !== 0xF7) {
      return;
    }

    // Check manufacturer ID and device ID
    if (data[1] !== 0x00 || data[2] !== 0x7D || data[3] !== 0x01) {
      return;
    }

    const command = data[4];
        
    switch (command) {
      case SYSEX_CMD_GET_INFO:
        this.handleInfoResponse(data);
        break;
        
      case SYSEX_CMD_GET_MESSAGE:
        this.handleMessageResponse(data);
        break;
        
      case SYSEX_CMD_SET_MESSAGE:
        this.handleSetResponse(data);
        break;
    }
  }

  /**
   * デバイス情報レスポンス処理
   */
  handleInfoResponse(data) {
    if (data.length < 8) return;
    
    const info = {
      numSwitches: data[5],
      version: data[6]
    };

    this.dispatchEvent(new CustomEvent('infoReceived', { 
      detail: info
    }));

    const pending = this.pendingResponses.get('info');
    if (pending) {
      pending.resolve(info);
    }
  }

  /**
   * メッセージ取得レスポンス処理
   */
  handleMessageResponse(data) {
    if (data.length < 9) return;
    
    const switchNum = data[5];
    const eventType = data[6];
    const messageCount = data[7];
    const messages = [];

    let pos = 8;
    for (let i = 0; i < messageCount && pos + 3 < data.length; i++) {
      messages.push({
        msgType: data[pos++],
        channel: data[pos++],
        param1: data[pos++],
        param2: data[pos++]
      });
    }

    const result = {
      switchNum,
      eventType,
      messages
    };

    this.dispatchEvent(new CustomEvent('messagesReceived', { 
      detail: result
    }));

    const responseKey = `message_${switchNum}_${eventType}`;
    const pending = this.pendingResponses.get(responseKey);
    if (pending) {
      pending.resolve(result);
    }
  }

  /**
   * 設定完了レスポンス処理
   */
  handleSetResponse(data) {
    if (data.length < 7) return;
    
    const success = data[5] === 0x00;

    this.dispatchEvent(new CustomEvent('setComplete', { 
      detail: { success }
    }));

    // 全ての待機中のsetリクエストに応答
    for (const [key, pending] of this.pendingResponses.entries()) {
      if (key.startsWith('set_')) {
        if (success) {
          pending.resolve({ success });
        } else {
          pending.reject(new Error('Set operation failed'));
        }
      }
    }
  }
}

export default MidiManager;
