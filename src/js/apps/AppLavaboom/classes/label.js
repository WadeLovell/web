angular.module(primaryApplicationName).factory('Label', function() {
	var classes = {
		'Drafts': 'draft',
		'Spam': 'ban',
		'Starred': 'star'
	};

	var Label = function(opt) {
		var self = this;

		this.id = opt.id;
		this.name = opt.name;
		this.created = opt.date_created;
		this.modified = opt.date_modified;
		this.emailsTotal = opt.emails_total;
		this.isBuiltin = opt.builtin;

		this.iconClass = `icon-${classes[this.name] ? classes[this.name] : this.name.toLowerCase()}`;

		var unreadFromServer = opt.unread_threads_count;
		var unreadThreads = {};

		this.threadsUnread = unreadFromServer;

		this.addUnreadThreadId = (tid) => {
			if (self.name == 'Sent')
				return;

			unreadThreads[tid] = true;
			self.threadsUnread = unreadFromServer + Object.keys(unreadThreads).length;
		};
	};

	return Label;
});