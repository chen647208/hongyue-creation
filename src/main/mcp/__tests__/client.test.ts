/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */
import { describe, expect,it } from 'vitest';

import { MinimalMcpClient } from '../client.js';

/** 内联 mock MCP server（node -e）：initialize + tools/list + tools/call；
 * tools/call 的 name==='fail' 回 error 对象（验证客户端 error 通路）。 */
const MOCK_SERVER = `
const rl = require('readline').createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (line === 'noise: not json') { process.stdout.write('noise: not json\\n'); return; }
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.id === undefined) return;
  const respond = (payload) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, ...payload }) + '\\n');
  if (msg.method === 'initialize') respond({ result: { protocolVersion: '2025-03-26', serverInfo: { name: 'mock' } } });
  else if (msg.method === 'tools/list') respond({ result: { tools: [{ name: 'echo', description: '回声测试', inputSchema: { type: 'object', properties: {} } }] } });
  else if (msg.method === 'tools/call' && msg.params?.name === 'fail') respond({ error: { message: 'mock-fail' } });
  else if (msg.method === 'tools/call') respond({ result: { content: [{ type: 'text', text: 'echo:' + JSON.stringify(msg.params?.arguments ?? {}) }] } });
  else respond({ error: { message: 'unknown: ' + msg.method } });
});
`;

/** 握手后挂起的 server：只回 initialize，其余请求不回包（供超时用例）。 */
const HANGING_SERVER = `
const rl = require('readline').createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.id !== undefined && msg.method === 'initialize') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-03-26' } }) + '\\n');
  }
});
setInterval(() => {}, 1000);
`;

describe('MinimalMcpClient', () => {
  it('握手 + 列表 + 调用全链路', async () => {
    const client = new MinimalMcpClient(process.execPath, ['-e', MOCK_SERVER], 10000);
    try {
      await client.start();
      const tools = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(['echo']);
      const res = (await client.callTool('echo', { a: 1 })) as { content: Array<{ text: string }> };
      expect(res.content[0]?.text).toContain('"a":1');
    } finally {
      await client.close();
    }
  });

  it('服务端返回 error 对象时请求 reject，并携带服务端消息', async () => {
    const client = new MinimalMcpClient(process.execPath, ['-e', MOCK_SERVER], 10000);
    try {
      await client.start();
      await expect(client.callTool('fail', {})).rejects.toThrow('mock-fail');
    } finally {
      await client.close();
    }
  });

  it('请求超时（server 不回包）reject，后续 close 正常', async () => {
    const client = new MinimalMcpClient(process.execPath, ['-e', HANGING_SERVER], 300);
    try {
      await client.start();
      await expect(client.callTool('echo', {})).rejects.toThrow('MCP 请求超时');
    } finally {
      await client.close();
    }
  });

  it('响应流中的非 JSON 行（server 日志）忽略，不影响后续请求', async () => {
    const client = new MinimalMcpClient(process.execPath, ['-e', MOCK_SERVER], 10000);
    try {
      await client.start();
      // 噪声行（服务端日志）被 onLine 的 catch 吞掉；后续请求不受影响
      await expect(client.callTool('echo', {})).resolves.toMatchObject({ content: [{ type: 'text' }] });
    } finally {
      await client.close();
    }
  });

  it('不存在的命令启动失败', async () => {
    const client = new MinimalMcpClient('hongyue-definitely-not-a-binary-xyz', [], 3000);
    await expect(client.start()).rejects.toThrow();
    await client.close();
  });
});
