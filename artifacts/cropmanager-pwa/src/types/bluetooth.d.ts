interface BluetoothDevice {
  gatt?: BluetoothRemoteGATTServer;
  name?: string;
  id: string;
  addEventListener: (event: string, handler: () => void) => void;
}

interface BluetoothRemoteGATTServer {
  connect: () => Promise<BluetoothRemoteGATTServer>;
  getPrimaryServices: () => Promise<BluetoothRemoteGATTService[]>;
}

interface BluetoothRemoteGATTService {
  getCharacteristics: () => Promise<BluetoothRemoteGATTCharacteristic[]>;
}

interface BluetoothRemoteGATTCharacteristic {
  properties: BluetoothCharacteristicProperties;
  writeValue: (value: BufferSource) => Promise<void>;
}

interface BluetoothCharacteristicProperties {
  write: boolean;
  writeWithoutResponse: boolean;
}

interface Navigator {
  bluetooth?: {
    requestDevice: (options: { acceptAllDevices: boolean; optionalServices: string[] }) => Promise<BluetoothDevice>;
  };
}
