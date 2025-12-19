const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const QRCode = require('qrcode');
const { Gamepad } = require('node-gamepad');
const os = require('os');
const cors = require('cors'); // 引入CORS，解决GitHub Pages跨域问题

// 1. 获取电脑局域网IP（用于手机连接，排除本地回环地址和内网地址）
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      // 筛选IPv4、非127.0.0.1、非内网保留外的本地局域网IP
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
        return alias.address;
      }
    }
  }
  // 兜底返回本地回环地址
  return '127.0.0.1';
}

// 配置项
const localIP = getLocalIP();
const port = 3000; // 服务端口，可自行修改
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server }); // 创建WebSocket服务

// 2. 开启CORS跨域支持（允许所有域名访问，适配GitHub Pages）
app.use(cors());
// 解析JSON格式请求（可选，增强兼容性）
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// 3. 生成局域网连接二维码（电脑端访问该接口获取二维码）
app.get('/qrcode', async (req, res) => {
  // 二维码指向你的GitHub Pages地址（也可指向本地静态界面，二选一）
  // 注意：替换为你的实际GitHub Pages地址，格式：https://你的用户名.github.io/仓库名/
  const githubPagesUrl = `https://tanzhijunboke.github.io/nd/`;
  // 本地静态界面地址（备用，若未部署GitHub Pages可使用）
  const localStaticUrl = `http://${localIP}:${port}`;

  try {
    // 生成GitHub Pages地址的二维码（优先推荐）
    const qrImage = await QRCode.toDataURL(githubPagesUrl, { 
      width: 300, 
      margin: 1 
    });
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Xbox手柄模拟 - 扫码连接</title>
          <style>
            body { 
              text-align: center; 
              margin-top: 50px; 
              font-family: Arial, sans-serif;
              background-color: #f5f5f5;
            }
            .qr-container { 
              display: inline-block; 
              padding: 20px; 
              background: #fff; 
              border: 1px solid #eee; 
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            p { 
              color: #333; 
              margin-top: 20px; 
              line-height: 1.6;
            }
            .url-list {
              margin-top: 15px;
              font-size: 14px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="qr-container">
            <img src="${qrImage}" alt="GitHub Pages连接二维码">
          </div>
          <p>手机扫码连接（确保与电脑同一局域网）</p>
          <div class="url-list">
            <p>GitHub Pages地址：${githubPagesUrl}</p>
            <p>电脑局域网IP：${localIP}</p>
            <p>本地服务端口：${port}</p>
            <p>本地二维码地址：http://${localIP}:${port}/qrcode</p>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('生成二维码失败：', err);
    res.status(500).send(`生成二维码失败：${err.message}`);
  }
});

// 4. 初始化Xbox手柄模拟（xbox360型号，兼容大部分Xbox手柄）
let xboxGamepad;
try {
  // 初始化xbox360手柄
  xboxGamepad = new Gamepad('xbox360');
  // 建立手柄连接
  xboxGamepad.connect();
  console.log('✅ Xbox手柄模拟初始化成功');
} catch (err) {
  console.error('❌ Xbox手柄模拟初始化失败：', err.message);
  console.warn('提示：请确保安装了Xbox手柄驱动，或检查node-gamepad依赖是否安装完整');
}

// 5. WebSocket核心通信：接收手机指令并模拟手柄操作
wss.on('connection', (ws) => {
  console.log('📱 手机设备已成功连接');

  // 接收手机端发送的指令
  ws.on('message', (message) => {
    try {
      // 解析JSON格式指令
      const cmd = JSON.parse(message.toString());
      const { type, key, value } = cmd;

      // 跳过未初始化手柄的指令
      if (!xboxGamepad) {
        console.warn('手柄未初始化，跳过指令处理');
        return;
      }

      // 类型1：按键操作（按下/释放，value=1为按下，value=0为释放）
      if (type === 'button') {
        if (typeof key === 'string' && (value === 0 || value === 1)) {
          if (value === 1) {
            xboxGamepad.press(key);
            // console.log(`按下按键：${key}`);
          } else {
            xboxGamepad.release(key);
            // console.log(`释放按键：${key}`);
          }
        }
      }

      // 类型2：摇杆操作（左右摇杆X/Y轴，value范围：-1 ~ 1）
      if (type === 'joystick') {
        if (typeof key === 'string' && typeof value === 'number' && value >= -1 && value <= 1) {
          xboxGamepad.setAxis(key, value);
          // console.log(`设置摇杆${key}：${value}`);
        }
      }

      // 类型3：扳机键操作（LT/RT，value范围：0 ~ 1）
      if (type === 'trigger') {
        if (typeof key === 'string' && typeof value === 'number' && value >= 0 && value <= 1) {
          xboxGamepad.setAxis(key, value);
          // console.log(`设置扳机键${key}：${value}`);
        }
      }
    } catch (err) {
      console.error('❌ 处理手机指令失败：', err.message);
    }
  });

  // 手机断开连接事件
  ws.on('close', () => {
    console.log('📱 手机设备已断开连接');
  });

  // WebSocket错误事件
  ws.on('error', (err) => {
    console.error('❌ WebSocket通信错误：', err.message);
  });
});

// 6. 启动HTTP + WebSocket服务
server.listen(port, () => {
  console.log('=====================================');
  console.log('🎮 Xbox手柄模拟服务已启动');
  console.log('=====================================');
  console.log(`电脑局域网IP：${localIP}`);
  console.log(`服务端口：${port}`);
  console.log(`二维码访问地址：http://${localIP}:${port}/qrcode`);
  console.log(`GitHub Pages地址：https://your-github-username.github.io/your-repo-name/`);
  console.log(`=====================================`);
});

// 捕获进程退出信号，释放手柄资源
process.on('SIGINT', () => {
  if (xboxGamepad) {
    xboxGamepad.disconnect();
    console.log('✅ Xbox手柄模拟资源已释放');
  }
  server.close(() => {
    console.log('✅ 服务已正常关闭');
    process.exit(0);
  });
});