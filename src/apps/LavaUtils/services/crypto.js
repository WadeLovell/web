module.exports = function($q, $rootScope, $injector, consts, co, utils, helpers, CryptoKeysStorage) {
	const self = this;

	let storage = null;
	let keyring = null;
	let isInitialized = false;

	const defaultOptions = {
		isPrivateComputer: false,
		isShortMemory: false
	};

	const wrapOpenpgpKeyring = (keyring) => {
		const findByFingerprint = (keys, fingerprint) => keys.find(k => k.primaryKey.fingerprint == fingerprint);

		const findIndexByFingerprint = (keys, fingerprint) => keys.findIndex(k => k.primaryKey.fingerprint == fingerprint);

		const getForAddress = (keys, email) => keys.filter(k => helpers.unStyleEmail(utils.getEmailFromAddressString(k.users[0].userId.userid)) == email);

		keyring.publicKeys.findByFingerprint = (fingerprint) => findByFingerprint(keyring.publicKeys.keys, fingerprint);
		keyring.privateKeys.findByFingerprint = (fingerprint) => findByFingerprint(keyring.privateKeys.keys, fingerprint);

		keyring.publicKeys.findIndexByFingerprint = (fingerprint) => findIndexByFingerprint(keyring.publicKeys.keys, fingerprint);
		keyring.privateKeys.findIndexByFingerprint = (fingerprint) => findIndexByFingerprint(keyring.privateKeys.keys, fingerprint);

		keyring.publicKeys.getForAddress = (email) => getForAddress(keyring.publicKeys.keys, helpers.unStyleEmail(email));
		keyring.privateKeys.getForAddress = (email) => getForAddress(keyring.privateKeys.keys, helpers.unStyleEmail(email));

		return keyring;
	};

	const changePasswordForPrivateKey = (privateKey, newPassword) => {
		try {
			if (!privateKey || !privateKey.primaryKey.isDecrypted)
				return null;

			const packets = privateKey.getAllKeyPackets();
			packets.forEach(packet => packet.encrypt(newPassword));

			const i = keyring.privateKeys.findIndexByFingerprint(privateKey.primaryKey.fingerprint);
			if (i > -1) {
				const updatedPrivateKey = openpgp.key.readArmored(privateKey.armor()).keys[0];
				keyring.privateKeys.keys[i] = updatedPrivateKey;
				return updatedPrivateKey;
			}

			return null;
		} catch (catchedError) {
			console.error(catchedError);
			return null;
		}
	};

	const applyPasswordToKeyPair = (privateKey, password) => {
		if (privateKey.primaryKey.isDecrypted)
			return true;

		try {
			return privateKey.decrypt(password);
		} catch (catchedError) {
			console.error(catchedError);
			return false;
		}
	};

	const getDecryptedPrivateKeys = () => keyring.privateKeys.keys.filter(k => k.primaryKey.isDecrypted);

	const authenticate = (privateKey, password, isPersist = false) => {
		if (!applyPasswordToKeyPair(privateKey, password))
			return false;

		const updatedPrivateKey = changePasswordForPrivateKey(privateKey, '');
		if (isPersist && updatedPrivateKey)
			self.importPrivateKey(updatedPrivateKey);

		return true;
	};

	this.options = {};

	this.decodeRaw = (message) => co(function *(){
		if (!message)
			throw new Error('nothing_to_decrypt');

		const pgpMessage = openpgp.message.readArmored(message);

		console.log('decodeRaw with keys', getDecryptedPrivateKeys());

		const decryptResults = yield (getDecryptedPrivateKeys()
			.map(key => {
				var encryptionKeyIds = pgpMessage.getEncryptionKeyIds();
				if (!encryptionKeyIds.length)
					return null;

				var privateKeyPacket = key.getKeyPacket(encryptionKeyIds);
				if (!privateKeyPacket || !privateKeyPacket.isDecrypted)
					return null;

				return co.def(openpgp.decryptMessage(key, pgpMessage), null);
			})
			.filter(k => !!k));

		const r = decryptResults.find(r => r);
		if (!r)
			throw new Error('no_private_key');

		return r;
	});

	this.encodeWithKeys = (message, publicKeys) => co(function *(){
		const mergedPublicKeys = publicKeys.reduce((a, k) => {
			a = a.concat(openpgp.key.readArmored(k).keys);
			return a;
		}, []);

		return {
			pgpData: yield openpgp.encryptMessage(mergedPublicKeys, message),
			mergedPublicKeys: mergedPublicKeys
		};
	});

	this.getAvailableSourceEmails = () => utils.uniqMap(keyring.privateKeys.keys,
		k => utils.getEmailFromAddressString(k.users[0].userId.userid));

	this.getAvailablePrivateKeys = () => keyring.privateKeys.keys;

	this.getAvailablePublicKeysForEmail = (email) => keyring.publicKeys.getForAddress(email);

	this.getAvailablePrivateKeysForEmail = (email) => keyring.privateKeys.getForAddress(email);

	this.getPublicKeyByFingerprint = (fingerprint) => keyring.publicKeys.findByFingerprint(fingerprint);

	this.getPrivateKeyByFingerprint = (fingerprint) => keyring.privateKeys.findByFingerprint(fingerprint);

	this.readKey = (key) => {
		return openpgp.key.readArmored(key).keys[0];
	};

	this.importPublicKey = (publicKeySubst) => {
		console.log('importing public key', publicKeySubst);

		if (!publicKeySubst)
			return;

		let user = $injector.get('user');

		let publicKeys = publicKeySubst.armor
			? [publicKeySubst]
			: openpgp.key.readArmored(publicKeySubst).keys;

		for(let publicKey of publicKeys) {
			const i = keyring.publicKeys.findIndexByFingerprint(publicKey.primaryKey.fingerprint);
			if (i > -1) {
				console.log('remove existing public key with fingerprint', publicKey.primaryKey.fingerprint, 'index', i);
				keyring.publicKeys.keys.splice(i, 1);
			}

			//publicKey.users.splice(1);
			//publicKey.users[0].userId.userid = `${user.settings.firstName} ${user.settings.lastName} <${user.styledEmail}>`;

			keyring.publicKeys.importKey(publicKey.armor());
			keyring.store();
		}
	};

	this.importPrivateKey = (privateKeySubst) => {
		console.log('importing private key', privateKeySubst);

		if (!privateKeySubst)
			return;

		let user = $injector.get('user');

		let privateKeys = privateKeySubst.armor
			? [privateKeySubst]
			: openpgp.key.readArmored(privateKeySubst).keys;

		for(let privateKey of privateKeys) {
			const i = keyring.privateKeys.findIndexByFingerprint(privateKey.primaryKey.fingerprint);
			if (i > -1) {
				console.log('remove existing private key with fingerprint', privateKey.primaryKey.fingerprint, 'index', i);
				keyring.privateKeys.keys.splice(i, 1);
			}

			privateKey.users.splice(1);
			privateKey.users[0].userId.userid = `${user.settings.firstName} ${user.settings.lastName} <${user.styledEmail}>`;

			keyring.privateKeys.importKey(privateKey.armor());
			keyring.store();
		}
	};

	this.clearPermanentPrivateKeysForEmail = (email) => {
		return storage.clearPermanentPrivateKeysForEmail(email);
	};

	this.restorePrivateKeys = (privateKeys, privateSecuredKeys) => {
		storage.storePrivate(privateKeys);
		storage.storePrivate(privateSecuredKeys);
		self.initialize();
		for(let k of privateKeys)
			self.importPrivateKey(k);
		for(let k of privateSecuredKeys)
			self.importPrivateKey(k);
	};

	this.storeKeyring = () => {
		keyring.store();
	};

	this.initialize = (opt = {}) => {
		const storedOptions = utils.def(() => JSON.parse(localStorage['lava-crypto-options']), {});
		self.options = angular.extend({}, defaultOptions, storedOptions, opt);
		console.log('initialize crypto with ', self.options, 'provided', opt);
		localStorage['lava-crypto-options'] = JSON.stringify(self.options);

		if (!isInitialized) {
			const threadsCount = navigator.hardwareConcurrency ? navigator.hardwareConcurrency - 1 : consts.CRYPTO_DEFAULT_THREAD_POOL_SIZE;

			console.log('Initialize openpgp in multi-threading mode, workers count: ', threadsCount);
			openpgp.initWorker('/js/vendor/LavaUtils/openpgp.worker.js', {threadsCount: threadsCount});
			isInitialized = true;
		}

		[keyring, storage] = self.createKeyring(true);
		if (!process.env.IS_PRODUCTION)
			window.keyring = keyring;

		$rootScope.$broadcast('keyring-updated');
	};

	this.createKeyring = (isLoadDecrypted = false) => {
		const storage = new CryptoKeysStorage(
			self.options.isPrivateComputer,
			self.options.isShortMemory,
			self.options.email ? [self.options.email] : [],
			isLoadDecrypted
		);

		return [wrapOpenpgpKeyring(new openpgp.Keyring(storage)), storage];
	};

	this.generateKeys = (nameEmail, password, numBits) => {
		if (!numBits)
			numBits = consts.DEFAULT_KEY_LENGTH;

		return co(function *(){
			const freshKeys = yield openpgp.generateKeyPair({numBits: numBits, userId: nameEmail, passphrase: password});

			const publicKey = openpgp.key.readArmored(freshKeys.publicKeyArmored).keys[0];
			const privateKey = openpgp.key.readArmored(freshKeys.privateKeyArmored).keys[0];

			return {
				pub: publicKey,
				prv: privateKey
			};
		});
	};

	this.changePassword = (email, oldPassword, newPassword) => {
		const privateKeys = keyring.privateKeys.getForAddress(email);

		console.log('crypto.changePassword privateKeys:', privateKeys);

		privateKeys.forEach(privateKey => {
			if (authenticate(privateKey, oldPassword)) {
				console.log('crypto.changePassword authenticated');
				const updatedPrivateKey = changePasswordForPrivateKey(privateKey, newPassword);
				if (updatedPrivateKey) {
					console.log('crypto.changePassword updated', updatedPrivateKey);
					self.importPrivateKey(updatedPrivateKey);

					authenticate(updatedPrivateKey, newPassword);
				}
			}
		});
	};

	this.authenticateByEmail = (email, password) => {
		const decryptedFingerprints = [];
		const failedFingerprints = [];

		keyring.privateKeys.getForAddress(email).forEach(privateKey => {
			if (authenticate(privateKey, password, true)) {
				decryptedFingerprints.push(privateKey.primaryKey.fingerprint);
			} else
				failedFingerprints.push(privateKey.primaryKey.fingerprint);
		});

		if (decryptedFingerprints.length > 0)
			$rootScope.$broadcast('keyring-updated');

		return {
			decryptedFingerprints: decryptedFingerprints,
			failedFingerprints: failedFingerprints
		};
	};

	this.authenticate = (privateKey, password) => {
		if (!authenticate(privateKey, password, true))
			return false;

		$rootScope.$broadcast('keyring-updated');

		return true;
	};

	this.hash = (data) => openpgp.util.hexstrdump(openpgp.crypto.hash.sha256(data));

	this.encodeEnvelopeWithKeys = (data, publicKeys, dataFieldName = 'data', prefixName = '') => co(function *(){
		if (!data.encoding)
			data.encoding = 'raw';
		if (!data.majorVersion)
			data.majorVersion = consts.ENVELOPE_DEFAULT_MAJOR_VERSION;
		if (!data.minorVersion)
			data.minorVersion = consts.ENVELOPE_DEFAULT_MINOR_VERSION;

		if (prefixName)
			prefixName = `${prefixName}_`;

		const dataObj = data.encoding == 'json' ? JSON.stringify(data.data) : data.data;

		function formatDataObj() {
			if (Object.prototype.toString.call(dataObj) == '[object Uint8Array]')
				return utils.Uint8Array2str(dataObj);
			return dataObj;
		}

		const {pgpData, mergedPublicKeys} = publicKeys && publicKeys.length > 0
			? yield self.encodeWithKeys(dataObj, publicKeys)
			: {pgpData: formatDataObj(dataObj), mergedPublicKeys: []};

		const envelope = {
			pgp_fingerprints: mergedPublicKeys.map(k => k.primaryKey.fingerprint),
			encoding: data.encoding
		};

		envelope[dataFieldName] = pgpData;

		envelope[`${prefixName}version_major`] = data.majorVersion;
		envelope[`${prefixName}version_minor`] = data.minorVersion;

		return envelope;
	});

	this.decodeEnvelope = (envelope, prefixName = '', encoding = '') => co(function *(){
		if (prefixName)
			prefixName = `${prefixName}_`;
		if (encoding)
			envelope.encoding = encoding;

		let pgpData = envelope.data;
		let message = null;
		let state = 'ok';

		try {
			message = yield self.decodeRaw(pgpData);

			if (envelope.encoding == 'json')
				message = JSON.parse(message);
		} catch (error) {
			message = '';
			state = error.message;
			console.error('decodeEnvelope', error);
		}

		return {
			data: message,
			state: state,
			majorVersion: envelope[`${prefixName}version_major`],
			minorVersion: envelope[`${prefixName}version_minor`]
		};
	});

	this.messageToBinary = (message) => openpgp.message.readArmored(message).packets.write();

	this.removeAllKeys = () => {
		storage.clearAllKeys();
	};

	this.removeSensitiveKeys = (isTriggerUpdateEvent = false) => {
		storage.clearDecryptedPrivateKeys();

		if (isTriggerUpdateEvent)
			self.initialize();
	};
};