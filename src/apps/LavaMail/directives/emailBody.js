module.exports = ($translate, $timeout, $state, $compile, $sanitize, $templateCache,
							   co, user, consts, utils, crypto, notifications) => {
	const emailRegex = /([-A-Z0-9_.]*[A-Z0-9]@[-A-Z0-9_.]*[A-Z0-9])/ig;
	const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
	const pgpRegex = /(-----BEGIN PGP MESSAGE-----[^-]+-----END PGP MESSAGE-----)/ig;

	const translations = {
		TITLE_OPENPGP_BLOCK_DECRYPT_ERROR_NO_KEY_FOUND: '',
		TITLE_OPENPGP_BLOCK_DECRYPT_ERROR: ''
	};

	$translate.bindAsObject(translations, 'LAVAMAIL.INBOX');

	let thisLocationPrefix = window.location.protocol + '//' + window.location.host;

	const transformCustomTextNodes = (dom, transforms, level = 0) => {
		for(let node of dom.childNodes) {
			if (node.nodeName == '#text') {
				const data = node.data.trim();
				const parent = node.parentNode;

				if (!data || !parent)
					continue;

				let newData = node.data;
				for (let t of transforms)
					newData = newData.replace(t.regex, t.replace);

				if (newData && newData != node.data) {
					const newDataDOM = utils.getDOM(newData);
					let newDataNodes = [];
					for (let i = 0; i < newDataDOM.childNodes.length; i++)
						newDataNodes.push(newDataDOM.childNodes[i]);

					for (let i = 0; i < newDataNodes.length; i++)
						parent.insertBefore(newDataNodes[i], node);
					parent.removeChild(node);
				}
			}
			else if (node.nodeName != 'A' && node.childNodes)
				transformCustomTextNodes(node, transforms, level + 1);
		}

		if (level === 0)
			return dom;
	};

	const transformTextNodes = (dom, threadId, level = 0) => co(function *(){
		if (level >= 3)
			return;

		let pgpMessages = {};

		const pgpRemember = (str, pgpMessage) => {
			pgpMessages[pgpMessage] = co(function *(){
				try {
					let message = yield crypto.decodeRaw(pgpMessage);

					let wrappedMessage = `<div>${message}</div>`;
					let sanitizedMessage = $sanitize(wrappedMessage);

					let dom = utils.getDOM(sanitizedMessage);

					yield transformTextNodes(dom, threadId, level + 1);

					return dom.innerHTML;
				} catch (error) {
					if (error.message == 'no_private_key') {
						notifications.set('openpgp-envelope-decode-failed', {
							text: translations.TITLE_OPENPGP_BLOCK_DECRYPT_ERROR_NO_KEY_FOUND,
							type: 'warning',
							namespace: 'mailbox-' + threadId,
							kind: 'crypto'
						});
						return `<pre title='${translations.TITLE_OPENPGP_BLOCK_DECRYPT_ERROR_NO_KEY_FOUND}'>${pgpMessage}</pre>`;
					}

					notifications.set('openpgp-envelope-decode-failed', {
						text: translations.TITLE_OPENPGP_BLOCK_DECRYPT_ERROR,
						type: 'warning',
						namespace: 'mailbox-' + threadId,
						kind: 'crypto'
					});
					return `<pre title='${translations.TITLE_OPENPGP_BLOCK_DECRYPT_ERROR}'>${pgpMessage}</pre>`;
				}
			});
			return pgpMessage;
		};

		const pgpReplace = (str, pgpMessage) => {
			if (pgpMessages[pgpMessage]) {
				return pgpMessages[pgpMessage];
			} else console.error('cannot replace hidden message!');
			return pgpMessage;
		};

		transformCustomTextNodes(dom, [
			{regex: pgpRegex, replace: pgpRemember}
		]);

		pgpMessages = yield pgpMessages;

		transformCustomTextNodes(dom, [
			{regex: pgpRegex, replace: pgpReplace}
		]);

		transformCustomTextNodes(dom, [
			{regex: emailRegex, replace: '<a href="mailto:$1">$1</a>'},
			{regex: urlRegex, replace: '<a href="$1">$1</a>'}
		]);
	});

	let linksCounter = 0;
	const transformEmail = (dom, {imagesSetting, noImageTemplate, emails, status}, level = 0) => {
		const getEmailContextMenuDOM = (i) =>
			utils.getDOM(`<email-context-menu email="emails[${i}].email" is-open="emails[${i}].isDropdownOpened"></email-context-menu>`);
		const noImageTemplateDOM = utils.getDOM(noImageTemplate);

		if (level === 0) {
			linksCounter = 0;
		}

		const processNode = (node) => {
			if (node.nodeName == 'BLOCKQUOTE') {
				node.setAttribute('style', '');
				node.setAttribute('class', '');

				if (!status.isTopLevelBlockquoteProcessed) {
					node.parentNode.insertBefore(utils.getDOM(
						'<a href="#" class="collapse-blockquote" ng-click="status.isBlockquoteCollapsed = !status.isBlockquoteCollapsed">...</a>'
					), node);
					node.setAttribute('collapse', 'status.isBlockquoteCollapsed');
					status.isTopLevelBlockquoteProcessed = true;
				}
			} else
			if (node.nodeName == 'IMG') {
				let src = node.getAttribute('src');

				if (!src)
					return;
				src = src.trim();
				if (!src || src.startsWith('data:'))
					return;

				if (imagesSetting == 'none') {
					node.parentNode.replaceChild(noImageTemplateDOM, node);
				} else if (imagesSetting == 'proxy') {
					if (!src.startsWith(consts.IMAGES_PROXY_URI)) {
						const proxifiedImageUri = `${consts.IMAGES_PROXY_URI}/i/${src.replace(/http[s]*:\/\//i, '')}`;
						node.setAttribute('src', proxifiedImageUri);

						const parent = node.parentNode;
						if (parent.nodeName != 'A')
							return;

						let href = parent.getAttribute('href');
						if (!href)
							return;

						href = href.trim();
						if (href == src)
							parent.setAttribute('href', proxifiedImageUri);
					}
				} else if (imagesSetting == 'directHttps') {
					if (!src.startsWith('https://'))
						node.parentNode.replaceChild(noImageTemplateDOM, node);
				}
			} else
			if (node.nodeName == 'A') {
				let href = node.getAttribute('href');

				if (!href)
					return;
				href = href.trim();
				if (!href)
					return;

				if (href.startsWith('mailto:')) {
					const toEmail = href.replace('mailto:', '').trim();
					emails.push({
						email: toEmail,
						isDropdownOpened: false
					});

					node.setAttribute('href', $state.href('.popup.compose', {to: toEmail}));
					node.setAttribute('ng-right-click', `switchContextMenu(${linksCounter})`);

					const emailContextMenuDOM = getEmailContextMenuDOM(linksCounter);
					node.parentNode.replaceChild(emailContextMenuDOM, node);
					emailContextMenuDOM.appendChild(node);

					linksCounter++;
				} else if (!href.startsWith(thisLocationPrefix)) {
					node.setAttribute('target', '_blank');
				}
			}
		};

		for(let node of dom.childNodes) {
			processNode(node);

			if (node.childNodes)
				transformEmail(node, {imagesSetting, noImageTemplate, emails, status}, level + 1);
		}
	};

	const process = (scope, el, attrs) => co(function *(){
		const loadingTemplate = yield $templateCache.fetch(scope.loadingTemplateUrl);

		scope.isLoading = false;
		scope.originalEmail = scope.emailBody;

		let loadingTimeout = $timeout(() => {
			scope.isLoading = true;
		}, scope.showLoadingSignAfter);

		el.empty();
		el.append($compile(angular.element(loadingTemplate))(scope));

		scope.emails = [];
		scope.status = {
			isBlockquoteCollapsed: true,
			isTopLevelBlockquoteProcessed: false
		};
		scope.switchContextMenu = index => scope.emails[index].isDropdownOpened = !scope.emails[index].isDropdownOpened;

		const noImageTemplate = yield $templateCache.fetch(scope.noImageTemplateUrl);
		const snapTemplate = yield $templateCache.fetch(scope.snapTemplateUrl);

		let emailBody = null;
		try {
			let wrapperTag = scope.isHtml ? 'div' : 'pre';
			let wrappedEmailBody = `<${wrapperTag} class="email">${scope.emailBody}</${wrapperTag}>`;

			console.log('email before sanitize', wrappedEmailBody);
			let sanitizedEmailBody = $sanitize(wrappedEmailBody);
			console.log('email after sanitize', sanitizedEmailBody);

			let dom = utils.getDOM(sanitizedEmailBody);

			yield transformTextNodes(dom, scope.threadId);

			transformEmail(dom, {
				imagesSetting: user.settings.images,
				noImageTemplate: noImageTemplate,
				emails: scope.emails,
				status: scope.status
			});

			let emailBodyHtml = dom.innerHTML;

			let emailBodyEl = angular.element(emailBodyHtml);
			emailBody = $compile(emailBodyEl)(scope);
		} catch (err) {
			console.error(`error during email body transforming: "${err.message}"`);

			try {
				let emailBodyEl = angular.element(snapTemplate);
				emailBody = $compile(emailBodyEl)(scope);
			} catch (err) {
				console.error(`error during snap template processing: "${err.message}"`);
				return;
			}
		}

		$timeout(() => {
			el.empty();
			el.append(emailBody);
			scope.emailBody = emailBody.html();

			$timeout.cancel(loadingTimeout);
			scope.isLoading = false;
		}, 100);
	});

	return {
		restrict : 'A',
		scope: {
			showLoadingSignAfter: '=',
			isHtml: '=',
			threadId: '=',
			emailBody: '=',
			originalEmailName: '=',
			noImageTemplateUrl: '@',
			loadingTemplateUrl: '@',
			snapTemplateUrl: '@',
			openEmail: '=',
			downloadEmail: '='
		},
		link  : (scope, el, attrs) => {
			process(scope, el, attrs);
		}
	};
};