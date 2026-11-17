import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chmod,copyFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

const version = '1.8.6';
const sourceHash = 'f8e632016ceae556f3132a16c7f704be1e7715595041f474fa81a2b64c1abf7c';

export async function packageWhisper(stage, platform) {
  const archive = path.join(stage,'whisper-source.tar.gz');
  const response = await fetch('https://codeload.github.com/ggml-org/whisper.cpp/tar.gz/refs/tags/v'+version,{
    signal:AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw Error('Could not download whisper.cpp source.');
  const contents = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(contents).digest('hex') !== sourceHash) {
    throw Error('The whisper.cpp source checksum does not match.');
  }
  await writeFile(archive,contents);
  const run = (program,args) => execFileSync(program,args,{stdio:'inherit'});
  run('tar',['-xzf',archive,'-C',stage]);

  const source = path.join(stage,'whisper.cpp-'+version);
  const build = path.join(stage,'whisper-build');
  const options = [
    '-DBUILD_SHARED_LIBS=OFF','-DWHISPER_BUILD_TESTS=OFF','-DGGML_METAL=OFF','-DGGML_OPENMP=OFF',
    '-DGGML_NATIVE=OFF','-DGGML_AVX=OFF','-DGGML_AVX2=OFF','-DGGML_FMA=OFF','-DGGML_F16C=OFF',
    '-DGGML_BMI2=OFF','-DCMAKE_BUILD_TYPE=Release',
  ];
  const windowsHost = platform === 'win' && process.platform === 'win32';
  if (platform === 'mac') {
    options.push('-DCMAKE_OSX_ARCHITECTURES=arm64','-DCMAKE_OSX_DEPLOYMENT_TARGET=12.0');
  } else if (windowsHost) {
    options.push('-A','x64','-DCMAKE_POLICY_DEFAULT_CMP0091=NEW','-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded');
  } else {
    const mingw = process.env.POWERBRIX_MINGW_BIN;
    if (!mingw) throw Error('Set POWERBRIX_MINGW_BIN to the LLVM MinGW bin directory to cross-build Windows.');
    // The pinned whisper.cpp examples rely on transitive algorithm headers that LLVM MinGW omits.
    options.push('-DCMAKE_CXX_FLAGS=-include algorithm','-DCMAKE_SYSTEM_NAME=Windows','-DCMAKE_SYSTEM_PROCESSOR=x86_64','-DCMAKE_EXE_LINKER_FLAGS=-static',
      '-DCMAKE_C_COMPILER='+path.join(mingw,'x86_64-w64-mingw32-clang'),
      '-DCMAKE_CXX_COMPILER='+path.join(mingw,'x86_64-w64-mingw32-clang++'));
  }
  if (!windowsHost) options.push('-G','Ninja');

  run('cmake',['-S',source,'-B',build,...options]);
  run('cmake',['--build',build,'--config','Release','--target','whisper-cli','--parallel','5']);
  const output = path.join(stage,'whisper');
  await mkdir(output);
  const executable = platform === 'mac' ? 'whisper-cli' : 'whisper-cli.exe';
  const binaryDirectory = windowsHost ? path.join(build,'bin','Release') : path.join(build,'bin');
  await copyFile(path.join(binaryDirectory,executable),path.join(output,executable));
  await copyFile(path.join(source,'LICENSE'),path.join(output,'LICENSE.whisper.cpp'));
  await chmod(path.join(output,executable),0o755);
  return output;
}
