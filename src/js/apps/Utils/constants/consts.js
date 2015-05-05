const fs = require('fs');

module.exports = {
	API_URI: process.env.API_URI,
	ROOT_DOMAIN: process.env.TLD,
	COMMIT_ID: process.env.COMMIT_ID,
	MANIFEST: JSON.parse(fs.readFileSync(__dirname + '/../../../../../manifest.json', 'utf8')),
	ROOT_DOMAIN_LIST: ['lavaboom.com', 'lavaboom.io', 'lavaboom.co'],
	IMAGES_PROXY_URI: 'https://rr.lavaboom.io',
	DEFAULT_LANG: 'en',
	DEFAULT_KEY_LENGTH: 4096,
	ESTIMATED_KEY_GENERATION_TIME_SECONDS: 24,
	INBOX_REDIRECT_DELAY: 1000,
	LAVABOOM_SYNC_REDIRECT_DELAY: 1000,
	BACKUP_KEYS_REDIRECT_DELAY: 1000,
	ENVELOPE_DEFAULT_MAJOR_VERSION: 1,
	ENVELOPE_DEFAULT_MINOR_VERSION: 0,
	AUTO_SAVE_TIMEOUT: 1000,
	LOADER_SHOW_DELAY: 150,
	FAST_ACTIONS_TIMEOUT: 250,
	MUMBLE_SHOW_DELAY: 1000,
	CRYPTO_CACHE_MAX_ENTRY_SIZE: 1024 * 512,
	CRYPTO_CACHE_TTL: 60 * 60 * 1000,
	INBOX_LABELS_CACHE_TTL: 60 * 1000,
	INBOX_THREADS_CACHE_TTL: 60 * 1000,
	INBOX_EMAILS_CACHE_TTL: 60 * 10 * 1000,
	SET_READ_AFTER_TIMEOUT: 3000,
	KEYS_BACKUP_README: 'https://lavaboom.com/placeholder/help/backup-file',
	POPUP_AUTO_HIDE_DELAY: 500,
	ORDERED_LABELS: ['Inbox', 'Drafts', 'Sent', 'Starred', 'Spam', 'Trash'],
	PLAN_LIST: ['BASIC'/*, 'TEST'*/],
	CRYPTO_DEFAULT_THREAD_POOL_SIZE: 4,
	KEY_EXPIRY_DAYS: 365,
	KEY_EXPIRY_DAYS_WARNING: 10
};