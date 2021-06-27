import { Service, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback } from 'homebridge';
import { MideaPlatform } from './MideaPlatform'
import { MideaDeviceType } from './enums/MideaDeviceType'
import { MideaSwingMode } from './enums/MideaSwingMode'
import { MideaOperationalMode } from './enums/MideaOperationalMode'

export class MideaAccessory {

	public deviceId: string = ''
	public deviceType: MideaDeviceType = MideaDeviceType.AirConditioner
	public targetTemperature: any = 0
	public indoorTemperature: number = 0
	public outdoorTemperature: number = 0
	public useFahrenheit: boolean = false

	public currentHumidity: number = 0
	public targetHumidity: any = 0
	public waterLevel: number = 0

	public fanSpeed: number = 0
	public fanOnlyMode: boolean = false
	public temperatureSteps: number = 1
	public minTemperature: number = 17
	public maxTemperature: number = 30
	public powerState: any
	public supportedSwingMode: MideaSwingMode = MideaSwingMode.None
	public operationalMode: number = MideaOperationalMode.Off
	public swingMode: number = 0
	public ecoMode: boolean = false
	public name: string = ''
	public model: string = ''
	public userId: string = ''
	public firmwareVersion: string = '1.2.6'

	private service!: Service
	private fanService!: Service
	private outdoorTemperatureService!: Service

	constructor(
		private readonly platform: MideaPlatform,
		private readonly accessory: PlatformAccessory,
		private _deviceId: string,
		private _deviceType: MideaDeviceType,
		private _name: string,
		private _userId: string
	) {
		this.deviceId = _deviceId
		this.deviceType = _deviceType
		this.name = _name
		this.userId = _userId

		// Check for device specific overrides
		var smode = this.platform.getDeviceSpecificOverrideValue(this.deviceId, 'supportedSwingMode');

		if (smode) {
			switch (smode) {
				case 'Vertical':
					this.supportedSwingMode = MideaSwingMode.Vertical;
					break;
				case 'Horizontal':
					this.supportedSwingMode = MideaSwingMode.Horizontal;
					break;
				case 'Both':
					this.supportedSwingMode = MideaSwingMode.Both;
					break;
				default:
					this.supportedSwingMode = MideaSwingMode.None;
					break;
			}
		}

		this.platform.log.info('Created device:', this.name + ',', 'with ID:', this.deviceId + ',', 'and type:', this.deviceType)

		if (this.deviceType === MideaDeviceType.AirConditioner) {
			this.model = 'Air Conditioner';
		} else if (this.deviceType === MideaDeviceType.Dehumidifier) {
			this.model = 'Dehumidifier';
		} else this.model = 'Undefined';

		this.accessory.getService(this.platform.Service.AccessoryInformation)!
			.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Midea')
			.setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.firmwareVersion)
			.setCharacteristic(this.platform.Characteristic.Model, this.model)
			.setCharacteristic(this.platform.Characteristic.SerialNumber, this.deviceId)

		// Air Conditioner
		if (this.deviceType === MideaDeviceType.AirConditioner) {
			this.service = this.accessory.getService(this.platform.Service.HeaterCooler) || this.accessory.addService(this.platform.Service.HeaterCooler)
			this.service.setCharacteristic(this.platform.Characteristic.Name, this.name)
			this.service.getCharacteristic(this.platform.Characteristic.Active)
				.on('get', this.handleActiveGet.bind(this))
				.on('set', this.handleActiveSet.bind(this))
			this.service.getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
				.on('get', this.handleCurrentHeaterCoolerStateGet.bind(this))
			this.service.getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
				.on('get', this.handleTargetHeaterCoolerStateGet.bind(this))
				.on('set', this.handleTargetHeaterCoolerStateSet.bind(this))
				.setProps({
					validValues: [
						this.platform.Characteristic.TargetHeaterCoolerState.AUTO,
						this.platform.Characteristic.TargetHeaterCoolerState.HEAT,
						this.platform.Characteristic.TargetHeaterCoolerState.COOL
					]
				})
			this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
				.on('get', this.handleCurrentTemperatureGet.bind(this))
				.setProps({
					minValue: -100,
					maxValue: 100,
					minStep: 0.1
				})
			this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
				.on('get', this.handleCoolingThresholdTemperatureGet.bind(this))
				.on('set', this.handleCoolingThresholdTemperatureSet.bind(this))
				.setProps({
					minValue: this.minTemperature,
					maxValue: this.maxTemperature,
					minStep: this.temperatureSteps
				})
			this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
				.on('get', this.handleHeatingThresholdTemperatureGet.bind(this))
				.on('set', this.handleHeatingThresholdTemperatureSet.bind(this))
				.setProps({
					minValue: this.minTemperature,
					maxValue: this.maxTemperature,
					minStep: this.temperatureSteps
				})
			this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed)
				.on('get', this.handleRotationSpeedGet.bind(this))
				.on('set', this.handleRotationSpeedSet.bind(this))
			this.service.getCharacteristic(this.platform.Characteristic.SwingMode)
				.on('get', this.handleSwingModeGet.bind(this))
				.on('set', this.handleSwingModeSet.bind(this))
			this.service.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
				.on('get', this.handleTemperatureDisplayUnitsGet.bind(this))
				.on('set', this.handleTemperatureDisplayUnitsSet.bind(this))
				.setProps({
					validValues: [
						this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT,
						this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS
					]
				});

			// Update HomeKit
			setInterval(() => {
				if (this.powerState !== undefined) {
					this.service.updateCharacteristic(this.platform.Characteristic.Active, this.powerState);
				} else {
					this.platform.log.debug("Not updating Active, powerState is undefined");
				} 
				this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState, this.currentHeaterCoolerState());
				this.service.updateCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState, this.targetHeaterCoolerState());
				this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.indoorTemperature);
				if (this.targetTemperature >= 17) {
					this.service.updateCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature, this.targetTemperature);
					this.service.updateCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature, this.targetTemperature);
				} else {
					this.platform.log.debug("Not updating HeatingThresholdTemperature and HeatingThresholdTemperature, targetTemperature has an invalid value");
				} 
				this.service.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.rotationSpeed());
				this.service.updateCharacteristic(this.platform.Characteristic.SwingMode, this.SwingMode());
				this.service.updateCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits, this.useFahrenheit);
			}, 5000);

			// Fan Mode
			if (this.platform.getDeviceSpecificOverrideValue(this.deviceId, 'fanOnlyMode') == true) {
				this.platform.log.debug('Add Fan Mode');
				this.fanService = this.accessory.getService(this.platform.Service.Fanv2) || this.accessory.addService(this.platform.Service.Fanv2);
				this.fanService.setCharacteristic(this.platform.Characteristic.Name, 'Fan');
				this.fanService.getCharacteristic(this.platform.Characteristic.Active)
					.on('get', this.handleFanActiveGet.bind(this))
					.on('set', this.handleFanActiveSet.bind(this));
				this.fanService.getCharacteristic(this.platform.Characteristic.RotationSpeed)
					.on('get', this.handleRotationSpeedGet.bind(this))
					.on('set', this.handleRotationSpeedSet.bind(this));
				this.fanService.getCharacteristic(this.platform.Characteristic.SwingMode)
					.on('get', this.handleSwingModeGet.bind(this))
					.on('set', this.handleSwingModeSet.bind(this));

				setInterval(() => {
					this.fanService.updateCharacteristic(this.platform.Characteristic.Active, this.fanActive());
					this.fanService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.rotationSpeed());
					this.fanService.updateCharacteristic(this.platform.Characteristic.SwingMode, this.SwingMode());
				}, 5000);

			} else {
				let fanService = this.accessory.getService(this.platform.Service.Fanv2);
				this.accessory.removeService(fanService);
			};

			// Outdoor Temperature Sensor
			if (this.platform.getDeviceSpecificOverrideValue(this.deviceId, 'OutdoorTemperature') == true) {
				this.platform.log.debug('Add Outdoor Temperature Sensor');
				this.outdoorTemperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor) || this.accessory.addService(this.platform.Service.TemperatureSensor);
				this.outdoorTemperatureService.setCharacteristic(this.platform.Characteristic.Name, 'Outdoor Temperature');
				this.outdoorTemperatureService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
					.on('get', this.handleOutdoorTemperatureGet.bind(this))
			} else {
				let outdoorTemperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor);
				this.accessory.removeService(outdoorTemperatureService);
			};

			// Dehumidifier
		} else if (this.deviceType === MideaDeviceType.Dehumidifier) {
			this.service = this.accessory.getService(this.platform.Service.HumidifierDehumidifier) || this.accessory.addService(this.platform.Service.HumidifierDehumidifier)
			this.service.setCharacteristic(this.platform.Characteristic.Name, this.name)
			this.service.getCharacteristic(this.platform.Characteristic.Active)
				.on('get', this.handleActiveGet.bind(this))
				.on('set', this.handleActiveSet.bind(this))
			this.service.getCharacteristic(this.platform.Characteristic.CurrentHumidifierDehumidifierState)
				.on('get', this.handleCurrentHumidifierDehumidifierStateGet.bind(this))
			this.service.getCharacteristic(this.platform.Characteristic.TargetHumidifierDehumidifierState)
				.on('get', this.handleTargetHumidifierDehumidifierStateGet.bind(this))
				.on('set', this.handleTargetHumidifierDehumidifierStateSet.bind(this))
				.setProps({
					validValues: [
						// this.platform.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER,
						// this.platform.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER,
						this.platform.Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER
					]
				})
			this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
				.on('get', this.handleCurrentRelativeHumidityGet.bind(this))
				.setProps({
					minValue: 0,
					maxValue: 100,
					minStep: 1
				})
			this.service.getCharacteristic(this.platform.Characteristic.RelativeHumidityDehumidifierThreshold)
				.on('get', this.handleRelativeHumidityDehumidifierThresholdGet.bind(this))
				.on('set', this.handleRelativeHumidityDehumidifierThresholdSet.bind(this))
				.setProps({
					minValue: 35,
					maxValue: 85,
					minStep: 5
				})
			// this.service.getCharacteristic(this.platform.Characteristic.RelativeHumidityHumidifierThreshold)
			// 	.on('get', this.handleRelativeHumidityHumidifierThresholdGet.bind(this))
			// 	.on('set', this.handleRelativeHumidityHumidifierThresholdSet.bind(this))
			// 	.setProps({
			// 		minValue: 35,
			// 		maxValue: 85,
			// 		minStep: 5
			// 	})
			// this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed)
			// 	.on('get', this.handleWindSpeedGet.bind(this))
			// 	.on('set', this.handleWindSpeedSet.bind(this))
			// this.service.getCharacteristic(this.platform.Characteristic.SwingMode)
			// 	.on('get', this.handleSwingModeGet.bind(this))
			// 	.on('set', this.handleSwingModeSet.bind(this))
			this.service.getCharacteristic(this.platform.Characteristic.WaterLevel)
				.on('get', this.handleWaterLevelGet.bind(this))

			// Update HomeKit
			setInterval(() => {
				this.service.updateCharacteristic(this.platform.Characteristic.Active, this.powerState);
				this.service.updateCharacteristic(this.platform.Characteristic.CurrentHumidifierDehumidifierState, this.currentHumidifierDehumidifierState());
				this.service.updateCharacteristic(this.platform.Characteristic.TargetHumidifierDehumidifierState, this.TargetHumidifierDehumidifierState());
				this.service.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.currentHumidity);
				this.service.updateCharacteristic(this.platform.Characteristic.RelativeHumidityDehumidifierThreshold, this.targetHumidity);
				// this.service.updateCharacteristic(this.platform.Characteristic.RelativeHumidityHumidifierThreshold, this.targetHumidity);
				// this.service.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.windSpeed());
				// 	this.service.updateCharacteristic(this.platform.Characteristic.SwingMode, this.SwingMode());
				this.service.updateCharacteristic(this.platform.Characteristic.WaterLevel, this.waterLevel);
			}, 5000);
		} else {
			this.platform.log.error('Unsupported device type: ', MideaDeviceType[this.deviceType]);
		};
	};
	// Handle requests to get the current value of the "Active" characteristic
	handleActiveGet(callback: CharacteristicGetCallback) {
		this.platform.log.debug('Triggered GET Active');
		if (this.powerState === 1) {
			callback(null, this.platform.Characteristic.Active.ACTIVE);
		} else {
			callback(null, this.platform.Characteristic.Active.INACTIVE);
		};
	};
	// Handle requests to set the "Active" characteristic
	handleActiveSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
		if (this.powerState !== value) {
			this.platform.log.debug('Triggered SET Active To:', value);
			this.powerState = value;
			this.platform.sendUpdateToDevice(this);
		};
		callback(null);
	};
	// Get the current value of the "CurrentHeaterCoolerState" characteristic
	public currentHeaterCoolerState() {
		if (this.powerState === this.platform.Characteristic.Active.INACTIVE) {
			return this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
		} else if (this.operationalMode === MideaOperationalMode.Cooling) {
			return this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
		} else if (this.operationalMode === MideaOperationalMode.Heating) {
			return this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
		} else if (this.indoorTemperature > this.targetTemperature) {
			return this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
		} else {
			return this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
		};
	};
	// Handle requests to get the current value of the "CurrentHeaterCoolerState" characteristic
	handleCurrentHeaterCoolerStateGet(callback: CharacteristicGetCallback) {
		this.platform.log.debug('Triggered GET Current HeaterCooler State');
		callback(null, this.currentHeaterCoolerState());
	};
	// Get the current value of the "TargetHeaterCoolerState" characteristic
	public targetHeaterCoolerState() {
		if (this.operationalMode === MideaOperationalMode.Cooling) {
			return this.platform.Characteristic.TargetHeaterCoolerState.COOL;
		} else if (this.operationalMode === MideaOperationalMode.Heating) {
			return this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
		} else return this.platform.Characteristic.TargetHeaterCoolerState.AUTO;
	};
	// Handle requests to get the current value of the "TargetHeaterCoolerState" characteristic
	handleTargetHeaterCoolerStateGet(callback: CharacteristicGetCallback) {
		this.platform.log.debug('Triggered GET Target HeaterCooler State');
		callback(null, this.targetHeaterCoolerState());
	};
	// Handle requests to set the "TargetHeaterCoolerState" characteristic
	handleTargetHeaterCoolerStateSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
		if (this.targetHeaterCoolerState() !== value) {
			this.platform.log.debug('Triggered SET HeaterCooler State To:', value);
			if (value === this.platform.Characteristic.TargetHeaterCoolerState.AUTO) {
				this.operationalMode = MideaOperationalMode.Auto;
			} else if (value === this.platform.Characteristic.TargetHeaterCoolerState.COOL) {
				this.operationalMode = MideaOperationalMode.Cooling;
			} else if (value === this.platform.Characteristic.TargetHeaterCoolerState.HEAT) {
				this.operationalMode = MideaOperationalMode.Heating;
			};
			this.platform.sendUpdateToDevice(this);
		};
		callback(null);
	};
	// Handle requests to get the current value of the "CurrentTemperature" characteristic
	handleCurrentTemperatureGet(callback: CharacteristicGetCallback) {
		this.platform.log.debug('Triggered GET CurrentTemperature');
		callback(null, this.indoorTemperature);
	};

	// Handle requests to get the current value of the "CoolingThresholdTemperature" characteristic
	handleCoolingThresholdTemperatureGet(callback: CharacteristicGetCallback) {
		this.platform.log.debug('Triggered GET CoolingThresholdTemperature');
		callback(null, this.targetTemperature);
	};
	// Handle requests to set the "CoolingThresholdTemperature" characteristic
	handleCoolingThresholdTemperatureSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
		if (this.useFahrenheit == true) {
			this.platform.log.debug('Triggered SET CoolingThresholdTemperature');
		} else {
			this.platform.log.debug('Triggered SET CoolingThresholdTemperature To:', value + '˚C');
		};
		if (this.targetTemperature !== value) {
			this.targetTemperature = value;
			this.platform.sendUpdateToDevice(this);
		};
		callback(null);
	};
	// Handle requests to get the current value of the "HeatingThresholdTemperature" characteristic
	handleHeatingThresholdTemperatureGet(callback: CharacteristicGetCallback) {
		this.platform.log.debug('Triggered GET HeatingThresholdTemperature');
		callback(null, this.targetTemperature);
	};
	// Handle requests to set the "HeatingThresholdTemperature" characteristic
	handleHeatingThresholdTemperatureSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
		if (this.useFahrenheit == true) {
			this.platform.log.debug('Triggered SET HeatingThresholdTemperature');
		} else {
			this.platform.log.debug('Triggered SET HeatingThresholdTemperature To:', value + '˚C');
		};
		if (this.targetTemperature !== value) {
			this.targetTemperature = value;
			this.platform.sendUpdateToDevice(this);
		};
		callback(null);
	};
	// Get the current value of the "RotationSpeed" characteristic
	public rotationSpeed() {
		if (this.fanSpeed < 0) {
			return 0;
		} else if (this.fanSpeed > 100) {
			return 100;
		} else {
			return this.fanSpeed;
		}	
	};
	// Handle requests to get the current value of the "RotationSpeed" characteristic
	handleRotationSpeedGet(callback: CharacteristicGetCallback) {
		this.platform.log.debug('Triggered GET RotationSpeed');
		callback(null, this.rotationSpeed());
	};
	// Handle requests to set the "RotationSpeed" characteristic
	handleRotationSpeedSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
		this.platform.log.debug('Triggered SET RotationSpeed To:', value);
		// transform values in percent
		// values from device are 20.0="Silent",40.0="Low",60.0="Medium",80.0="High",102.0="Auto"
		if (this.fanSpeed !== value) {
			if (value <= 0) {
				this.fanSpeed = 1;
			} else if (value > 100) {
				this.fanSpeed = 100;
			} else {
				this.fanSpeed = Number(value);
			}	
			this.platform.sendUpdateToDevice(this);
		};
		callback(null);
	};
	// Get the current value of the "swingMode" characteristic
	public SwingMode() {
		if (this.swingMode !== 0) {
			return this.platform.Characteristic.SwingMode.SWING_ENABLED;
		} else {
			return this.platform.Characteristic.SwingMode.SWING_DISABLED;
		};
	};
	// Handle requests to get the current value of the "swingMode" characteristic
	handleSwingModeGet(callback: CharacteristicGetCallback) {
		this.platform.log.debug('Triggered GET SwingMode');
		callback(null, this.SwingMode())
	};
	// Handle requests to set the "swingMode" characteristic
	handleSwingModeSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
		this.platform.log.debug('Triggered SET SwingMode To:', value);
		// convert this.swingMode to a 0/1
		if (this.swingMode !== value) {
			if (value === 0) {
				this.swingMode = 0;
			} else {
				this.swingMode = this.supportedSwingMode;
			};
			this.platform.sendUpdateToDevice(this)
		};
		callback(null);
	};
	// Handle requests to get the current value of the "Temperature Display Units" characteristic
	handleTemperatureDisplayUnitsGet(callback: CharacteristicGetCallback) {
		this.platform.log.debug('Triggered GET Temperature Display Units');
		if (this.useFahrenheit === true) {
			callback(null, this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT);
		} else {
			callback(null, this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS);
		};
	};
	// Handle requests to set the "Temperature Display Units" characteristic
	handleTemperatureDisplayUnitsSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
		this.platform.log.debug('Triggered SET Temperature Display Units To:', value);
		if (this.useFahrenheit !== value) {
			if (value === 1) {
				this.useFahrenheit = true;
			} else {
				this.useFahrenheit = false;
			};
			this.platform.sendUpdateToDevice(this);
		};
		callback(null);
	};

	// Fan mode
	// Get the current value of the "FanActive" characteristic
	public fanActive() {
		if (this.operationalMode === MideaOperationalMode.FanOnly && this.powerState === this.platform.Characteristic.Active.ACTIVE) {
			return this.platform.Characteristic.Active.ACTIVE;
		} else {
			return this.platform.Characteristic.Active.INACTIVE;
		};
	};
	// Handle requests to get the current status of "Fan Mode" characteristic
	handleFanActiveGet(callback: CharacteristicGetCallback) {
		this.platform.log.debug('Triggered GET FanMode');
		callback(null, this.fanActive());
	};
	// Handle requests to set the "Fan Mode" characteristic
	handleFanActiveSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
		this.platform.log.debug('Triggered SET FanMode To:', value);
		if (value === 1 && this.powerState === 1) {
			this.operationalMode = MideaOperationalMode.FanOnly;
		} else if (value === 1 && this.powerState === 0) {
			this.powerState = this.platform.Characteristic.Active.ACTIVE;
			this.operationalMode = MideaOperationalMode.FanOnly;
		} else if (value === 0 && this.powerState === 1) {
			this.powerState = this.platform.Characteristic.Active.INACTIVE;
		};
		this.platform.sendUpdateToDevice(this);
		callback(null);
	};

	// Outdoor Temperature Sensor
	// Handle requests to get the current value of the "OutdoorTemperature" characteristic
	handleOutdoorTemperatureGet(callback: CharacteristicGetCallback) {
		this.platform.log.debug('Triggered GET CurrentTemperature');
		callback(null, this.outdoorTemperature);
	};

	// HumidifierDehumidifier
	// Get the current value of the "CurrentHumidifierDehumidifierState" characteristic
	public currentHumidifierDehumidifierState() {
		if (this.powerState === 0) {
			return this.platform.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE;
		} else if (this.operationalMode === 0) {
			return this.platform.Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING;
		};
	};
	// Handle requests to get the current value of the "HumidifierDehumidifierState" characteristic
	handleCurrentHumidifierDehumidifierStateGet(callback: CharacteristicGetCallback) {
		this.platform.log.debug('Triggered GET CurrentHumidifierDehumidifierState');
		callback(null, this.currentHumidifierDehumidifierState());
	};
	// Get the current value of the "TargetHumidifierDehumidifierState" characteristic
	public TargetHumidifierDehumidifierState() {
		if (this.operationalMode === 0) {
			return this.platform.Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER;
		};
	};
	// Handle requests to get the target value of the "HumidifierDehumidifierState" characteristic
	handleTargetHumidifierDehumidifierStateGet(callback: CharacteristicGetCallback) {
		this.platform.log.debug('Triggered GET TargetHumidifierDehumidifierState');
		callback(null, this.TargetHumidifierDehumidifierState());
	};
	// Handle requests to set the target value of the "HumidifierDehumidifierState" characteristic
	handleTargetHumidifierDehumidifierStateSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
		this.platform.log.debug('Triggered SET TargetHumidifierDehumidifierState To:', value);
		if (this.TargetHumidifierDehumidifierState() !== value) {
			if (value === this.platform.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER) {
				this.operationalMode = 0;
			} else if (value === this.platform.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER) {
				this.operationalMode = 1;
			} else if (value === this.platform.Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER) {
				this.operationalMode = 0;
			};
			this.platform.sendUpdateToDevice(this);
		};
		callback(null);
	};
	// Handle requests to get the current value of the "RelativeHumidity" characteristic
	handleCurrentRelativeHumidityGet(callback: CharacteristicGetCallback) {
		this.platform.log.debug('Triggered GET CurrentRelativeHumidity');
		callback(null, this.currentHumidity);
	};
	// Handle requests to get the Relative value of the "HumidityDehumidifierThreshold" characteristic
	handleRelativeHumidityDehumidifierThresholdGet(callback: CharacteristicGetCallback) {
		this.platform.log.debug('Triggered GET RelativeHumidityDehumidifierThreshold');
		callback(null, this.targetHumidity);
	};
	// Handle requests to set the Relative value of the "HumidityDehumidifierThreshold" characteristic
	handleRelativeHumidityDehumidifierThresholdSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
		if (this.targetHumidity !== value) {
			this.platform.log.debug('Triggered SET RelativeHumidityDehumidifierThreshold To:', value);
			this.targetHumidity = value;
			this.platform.sendUpdateToDevice(this);
		};
		callback(null);
	};
	// Handle requests to get the Relative value of the "HumidityHumidifierThreshold" characteristic
	handleRelativeHumidityHumidifierThresholdGet(callback: CharacteristicGetCallback) {
		this.platform.log.debug('Triggered GET RelativeHumidityDehumidifierThreshold');
		callback(null, this.targetHumidity);
	};
	// Handle requests to set the Relative value of the "HumidityHumidifierThreshold" characteristic
	handleRelativeHumidityHumidifierThresholdSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
		if (this.targetHumidity !== value) {
			this.platform.log.debug('Triggered SET RelativeHumidityDehumidifierThreshold', value);
			this.targetHumidity = value;
			this.platform.sendUpdateToDevice(this);
		};
		callback(null);
	};
	// Get the current value of the "WindSpeed" characteristic
	public windSpeed() {
		return this.fanSpeed;
	};
	// Handle requests to get the current value of the "WindSpeed" characteristic
	handleWindSpeedGet(callback: CharacteristicGetCallback) {
		this.platform.log.debug('Triggered GET WindSpeed');
		callback(null, this.windSpeed());
	};
	// Handle requests to set the "RotationSpeed" characteristic
	handleWindSpeedSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
		this.platform.log.info('Triggered SET WindSpeed To:', value);
		if (value <= 0) {
			this.fanSpeed = 1;
		} else if (value > 100) {
			this.fanSpeed = 100;
		} else {
			this.fanSpeed = Number(value);
		}
		this.platform.sendUpdateToDevice(this);
		callback(null);

	};
	// Handle requests to get the current value of the "WaterLevel" characteristic
	handleWaterLevelGet(callback: CharacteristicGetCallback) {
		this.platform.log.debug('Triggered GET WaterLevel');
		callback(null, this.waterLevel);
	};
};