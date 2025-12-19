const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const QRCode = require('qrcode');
const { Gamepad } = require('node-gamepad');
const os = require('os');

// 1. 获取电脑局域网IP（用于手机连接）
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return '127.0.0.1';
}

const localIP = getLocalIP();
const port = 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 2. 静态文件托管（手机端界面）
app.use(express.static('public'));

// 3. 生成二维码（手机扫码访问）
app.get('/qrcode', async (req, res) => {
  const url = `http://${localIP}:${port}`;
  try {
    const qrImage = await QRCode.toDataURL(url, { width: 300 });
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Xbox手柄模拟 - 扫码连接</title>
          <style>
            body { text-align: center; margin-top: 50px; font-family: Arial; }
            .qr-container { display: inline-block; padding: 20px; background: #fff; border: 1px solid #eee; }
            p { color: #333; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="qr-container">
            <img src="${qrImage}" alt="局域网连接二维码">
          </div>
          <p>手机扫码连接（确保手机与电脑同一局域网）</p>
          <p>访问地址：${url}</p>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('生成二维码失败');
  }
});

// 4. 初始化Xbox手柄模拟
let xboxGamepad;
try {
  xboxGamepad = new Gamepad('xbox360');
  xboxGamepad.connect();
  console.log('Xbox手柄模拟初始化成功');
} catch (err) {
  console.error('Xbox手柄模拟初始化失败：', err);
}

// 5. WebSocket通信：接收手机指令并模拟手柄操作
wss.on('connection', (ws) => {
  console.log('手机已连接');

  ws.on('message', (message) => {
    try {
      const cmd = JSON.parse(message.toString());
      const { type, key, value } = cmd;

      // 按键操作（按下/释放）
      if (type === 'button') {
        if (xboxGamepad) {
          if (value === 1) {
            xboxGamepad.press(key); // 按下按键
          } else {
            xboxGamepad.release(key); // 释放按键
          }
        }
      }

      // 摇杆操作（左右摇杆X/Y轴）
      if (type === 'joystick') {
        if (xboxGamepad) {
          xboxGamepad.setAxis(key, value); // 设置摇杆轴值（范围：-1 ~ 1）
        }
      }

      // 扳机键操作（LT/RT，范围：0 ~ 1）
      if (type === 'trigger') {
        if (xboxGamepad) {
          xboxGamepad.setAxis(key, value);
        }
      }
    } catch (err) {
      console.error('处理指令失败：', err);
    }
  });

  ws.on('close', () => {
    console.log('手机已断开连接');
  });

  ws.on('error', (err) => {
    console.error('WebSocket错误：', err);
  });
});

// 启动服务
server.listen(port, () => {
  console.log(`服务已启动：`);
  console.log(`- 电脑局域网IP：${localIP}`);
  console.log(`- 二维码访问地址：http://${localIP}:${port}/qrcode`);
  console.log(`- 手机直接访问：http://${localIP}:${port}`);
});