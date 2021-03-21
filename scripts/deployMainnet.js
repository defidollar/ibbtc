const fs = require('fs')

const crvPools = {
    sbtc: {
        swap: '0x7fC77b5c7614E1533320Ea6DDc2Eb61fa00A9714',
        sett: '0xd04c48A53c111300aD41190D63681ed3dAd998eC'
    },
    ren: {
        swap: '0x93054188d876f558f4a66B2EF1d97d16eDf0895B',
        sett: '0x6dEf55d2e18486B9dDfaA075bc4e4EE0B28c1545'
    },
    tbtc: {
        swap: '0xC25099792E9349C7DD09759744ea681C7de2cb66',
        sett: '0xb9D076fDe463dbc9f915E5392F807315Bf940334'
    }
}

async function main() {
    const [ UpgradableProxy, BadgerSettPeak, Core, bBTC ] = await Promise.all([
        ethers.getContractFactory("UpgradableProxy"),
        ethers.getContractFactory("BadgerSettPeak"),
        ethers.getContractFactory("Core"),
        ethers.getContractFactory("bBTC"),
    ])

    let core = await UpgradableProxy.deploy()
    console.log({ core: core.address })

    const bBtc = await bBTC.deploy(core.address)
    console.log({ bBtc: bBtc.address })

    const coreImpl = await Core.deploy(bBtc.address)
    console.log({ coreImpl: coreImpl.address })
    await core.updateImplementation(coreImpl.address)

    let badgerPeak = await UpgradableProxy.deploy()
    console.log({ badgerPeak: badgerPeak.address })

    const badgerPeakImpl = await BadgerSettPeak.deploy(core.address)
    console.log({ badgerPeakImpl: badgerPeakImpl.address })
    await badgerPeak.updateImplementation(badgerPeakImpl.address)

    const pools = Object.keys(crvPools).map(k => crvPools[k], ['swap', 'sett'])
    await badgerPeak.modifyWhitelistedCurvePools(pools)

    const feeSink = '0x5b5cF8620292249669e1DCC73B753d01543D6Ac7' // DFD Governance Multisig
    await core.setConfig(10, 10, feeSink)

    await core.whitelistPeak(badgerPeak.address)

    const config = {
        badgerPeak: badgerPeak.address,
        bBtc: bBtc.address,
        core: core.address
    }
    fs.writeFileSync(
        `${process.cwd()}/deployments/mainnet.json`,
        JSON.stringify(config, null, 4) // Indent 4 spaces
    )
}

main()
.then(() => process.exit(0))
.catch(error => {
    console.error(error);
    process.exit(1);
});
