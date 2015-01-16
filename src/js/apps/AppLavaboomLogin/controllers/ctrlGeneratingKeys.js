angular.module('AppLavaboomLogin').controller('CtrlGeneratingKeys', function($scope, $state, $rootScope, $interval, $timeout, $translate, crypto, user, co, signUp) {
	if (!user.isAuthenticated())
		$state.go('login');

	const bits = 2048;
	const estimatedTimeSeconds = 120;
	var timePassed = 0;

	$scope.progress = 0;
	$scope.label = '';

	$scope.labelGenerating = '';
	$scope.labelGenerated = '';
	$scope.labelReached = '';

	var translate = function *(){
		$scope.label = $scope.labelGenerating = yield $translate('LOGIN.GENERATING_KEYS.LABEL_GENERATING');
		$scope.labelGenerated = yield $translate('LOGIN.GENERATING_KEYS.LABEL_GENERATED');
		$scope.labelReached = yield $translate('LOGIN.GENERATING_KEYS.LABEL_REACHED');
	};
	$rootScope.$on('$translateChangeSuccess',  () => {
		co(translate);
	});
	co(translate);

	crypto.initialize();

	var progressBarInterval = $interval(() => {
		$scope.progress = Math.floor(++timePassed / estimatedTimeSeconds * 100);
		if ($scope.progress >= 100) {
			$scope.label = $scope.labelReached;
			$interval.clear(progressBarInterval);
		}
	}, 1000);

	crypto.generateKeys(user.nameEmail, signUp.password, bits)
		.then((res) => {
			console.log('keys generated!', res);
			$scope.progress = 100;
			$scope.label = $scope.labelGenerated;
			$interval.cancel(progressBarInterval);

			$timeout(() => {
				$state.go('backupKeys');
			}, 1000);
		})
		.catch(err => {
			console.log('keys generation error!', err);
		});
});
