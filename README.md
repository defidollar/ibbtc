# Badger BTC (bBTC)

### Development
1. Compile
```
npm run compile
```

2. Unit Tests
```
npm t
```

3. Mainnet fork tests
```
ganache-cli --fork https://mainnet.infura.io/v3/4c28f61dc1fc4120b5b5ecb1d77aac2e -l 10000000 --unlock 0x15bf9a8de0e56112ee0fcf85e3c4e54fb22346dc --unlock 0xB65cef03b9B89f99517643226d76e286ee999e77

npm run test:fork
```
