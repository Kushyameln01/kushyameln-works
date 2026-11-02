"""Repository-owned dependency identities for the strict LLVM streaming build."""
BASE='https://deb.debian.org/debian/pool/main/l/llvm-toolchain-19/'
PACKAGES={
 'clang-19_19.1.7-3+b1_amd64.deb':'bbb74458d782b7792b61b0eed92746df5e6d033778c045cf8c2b3835b7c4efc4',
 'libclang-cpp19_19.1.7-3+b1_amd64.deb':'a7d2b6df51050834f6ea5c0d5e34869c2298b0bcdaa91eff17ba3db2cd545c47',
 'lld-19_19.1.7-3+b1_amd64.deb':'756a805e8811d527dd2b5417f016c9342b8631fa9c1ddcd56265c13ae33bf3a4',
}
SYSTEM_LLVM_PATH='/usr/lib/x86_64-linux-gnu/libLLVM-19.so'
EXPECTED_BINARIES={
 'clang':'0a3c55936ac43954fbe4914e6e73b577ca9e35e75d89ef13d3e28c187f41ca1a',
 'lld':'7a2fd87d82662beac4371a1a21067b37cd4b7d43777aa61c089d85c45f772f6e',
 'libclangCpp':'0108c687d2f500d77687984c46c9fad663782603f5c623e3c14224c155b4fd21',
 'systemLLVM':'3523f50f635d2a1ea47518a392451f2854b92823ceaf1345fb806099dd1a3b8a',
}
