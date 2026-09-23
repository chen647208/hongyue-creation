/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 插件签名工具：给插件目录签发 Ed25519 detached 签名，产物为 <插件目录>/plugin.sig。
 *
 * 签名对象是 plugin.json 的 UTF-8 文本，与宿主安装时读的是同一份字节
 * （`main/app/pluginStore.ts` 读同文件同编码后交给 `verifyEd25519`）。
 * 宿主侧判定：插件声明 logic / editor / scripts / renderers 任一可执行贡献点，
 * 就必须有 plugin.sig；信封里的公钥还须命中 设置 → 插件 的信任清单，
 * 清单为空时一律拒装（fail-closed）。
 *
 * 用法：
 *   生成密钥对（私钥自留，公钥交给使用者加入信任清单）
 *     node scripts/sign-plugin.mjs --generate-key <公钥.pub> <私钥.pem>
 *   给插件签名（覆盖写 plugin.sig）
 *     node scripts/sign-plugin.mjs --key <私钥.pem> <插件目录>
 *   校验已有签名是否匹配当前 plugin.json
 *     node scripts/sign-plugin.mjs --check <插件目录>
 *
 * 密钥对不进版本库：私钥泄露等于任何人都能以你的名义签发插件。
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const USAGE = `用法：
  node scripts/sign-plugin.mjs --generate-key <公钥.pub> <私钥.pem>
  node scripts/sign-plugin.mjs --key <私钥.pem> <插件目录>
  node scripts/sign-plugin.mjs --check <插件目录>`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function publicKeyPem(keyObject) {
  return keyObject.export({ type: 'spki', format: 'pem' }).toString();
}

/** 读私钥 PEM 并转成 KeyObject。 */
function readPrivateKey(file) {
  if (!existsSync(file)) fail(`找不到私钥文件 ${file}`);
  try {
    return createPrivateKey(readFileSync(file, 'utf-8'));
  } catch (error) {
    fail(`私钥解析失败（${file}）：${error instanceof Error ? error.message : String(error)}`);
  }
}

function manifestPathOf(pluginDir) {
  const dir = path.resolve(pluginDir);
  const manifestPath = path.join(dir, 'plugin.json');
  if (!existsSync(manifestPath)) fail(`找不到 ${manifestPath}`);
  return manifestPath;
}

function generateKeyPairFiles(publicOut, privateOut) {
  if (!publicOut || !privateOut) fail('--generate-key 需要两个参数：<公钥.pub> <私钥.pem>');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicPem = publicKeyPem(publicKey);
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  for (const [file, content] of [
    [publicOut, publicPem],
    [privateOut, privatePem],
  ]) {
    try {
      writeFileSync(file, content, 'utf-8');
    } catch (error) {
      fail(`写入 ${file} 失败（父目录不存在？）：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`已生成密钥对：\n  公钥 ${publicOut}（交给使用者加入信任清单）\n  私钥 ${privateOut}（自留，勿入库）`);
}

function signPluginDir(privateKeyFile, pluginDir) {
  if (!privateKeyFile || !pluginDir) fail('--key 需要两个参数：<私钥.pem> <插件目录>');
  const manifestPath = manifestPathOf(pluginDir);
  const manifestText = readFileSync(manifestPath, 'utf-8');
  const privateKey = readPrivateKey(privateKeyFile);
  const signature = sign(null, Buffer.from(manifestText, 'utf-8'), privateKey).toString('base64');
  const publicKey = publicKeyPem(createPublicKey(privateKey));
  const envelope = JSON.stringify({ algorithm: 'ed25519', signature, publicKey }, null, 2);
  writeFileSync(path.join(path.dirname(manifestPath), 'plugin.sig'), `${envelope}\n`, 'utf-8');
  console.log(`已写入 ${path.join(pluginDir, 'plugin.sig')}`);
  console.log(`  公钥指纹（使用者加入信任清单时核对）：${createHash('sha256').update(publicKey).digest('hex').slice(0, 32)}`);
}

function checkPluginDir(pluginDir) {
  if (!pluginDir) fail('--check 需要一个参数：<插件目录>');
  const dir = path.resolve(pluginDir);
  const manifestPath = manifestPathOf(dir);
  const sigPath = path.join(dir, 'plugin.sig');
  if (!existsSync(sigPath)) fail(`找不到 ${sigPath}：未签名的插件带可执行贡献点会被宿主拒装`);
  let envelope;
  try {
    envelope = JSON.parse(readFileSync(sigPath, 'utf-8'));
  } catch (error) {
    fail(`plugin.sig 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
  }
  if (envelope?.algorithm !== 'ed25519' || !envelope.signature || !envelope.publicKey) {
    fail('plugin.sig 缺少 algorithm / signature / publicKey 字段');
  }
  const ok = verify(
    null,
    Buffer.from(readFileSync(manifestPath, 'utf-8'), 'utf-8'),
    createPublicKey(envelope.publicKey),
    Buffer.from(envelope.signature, 'base64'),
  );
  if (!ok) fail('签名不匹配：plugin.json 在签名后被改动，需重新签名');
  console.log(`签名有效：${path.relative(process.cwd(), dir)}`);
}

const args = process.argv.slice(2);
if (args[0] === '--generate-key') {
  generateKeyPairFiles(args[1], args[2]);
} else if (args[0] === '--key') {
  signPluginDir(args[1], args[2]);
} else if (args[0] === '--check') {
  checkPluginDir(args[1]);
} else {
  console.error(USAGE);
  process.exit(1);
}
