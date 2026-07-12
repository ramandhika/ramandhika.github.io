const Auth = (() => ({
  isSetup: () => Store.isSetup(),
  isUnlocked: () => Store.isUnlocked(),
  init: (pin) => Store.init(pin),
  setup: (pin) => Store.setup(pin),
  changePin: (oldP, newP) => Store.changePin(oldP, newP),
  lock: () => Store.lock(),
}));
