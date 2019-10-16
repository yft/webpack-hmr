const path = require('path');
const express = require('express');
const mime = require('mime');
const webpack = require('webpack');
const MemoryFileSystem = require('memory-fs');
const config = require('./webpack.config');

class Server {
    constructor(compiler) {
        this.compiler = compiler;

        // 如果你把compiler的输出文件系统改成了 MemoryFileSystem的话，则以后再产出文件都打包内存里去了
        let fs = compiler.outputFileSystem = new MemoryFileSystem();

        // region 初始化开发时资源服务器
        let app = new express();
        app.use((req, res) => {
            let filename = path.join(config.output.path, req.url.slice(1));

            if (!fs.existsSync(filename)) return res.sendStatus(404);

            let stat = fs.statSync(filename);
            if (!stat.isFile()) return res.sendStatus(404);

            let content = fs.readFileSync(filename);
            let contentType = mime.getType(filename);
            res.setHeader('Content-Type', contentType);
            res.statusCode = res.statusCode || 200;
            res.send(content)
        });
        this.server = require('http').createServer(app);
        // endregion

        let lastHash; // 每次编译完成后都会产生一个stats对象，其中有一个hash值代表这一次编译结果hash就是一个32的字符串

        // region websocket 通信
        let sockets = [];

        let io = require('socket.io')(this.server);
        // 启动一个 websocket服务器，然后等待连接来到，连接到来之后socket
        io.on('connection', (socket) => {
            sockets.push(socket);
            socket.emit('hash');
            // 再向客户端发送一个ok
            socket.emit('ok')
        });
        // endregion

        // region webpack watch 及热更新通知
        compiler.hooks.done.tap('webpack-dev-server', (stats) => {
            lastHash = stats.hash;
            // 每当新一个编译完成后都会向客户端发送消息
            sockets.forEach(socket => {
                // 先向客户端发送最新的hash值
                // 每次编译都会产生一个hash值，另外如果是热更新的话，还会产出二个补丁文件。
                // 里面描述了从上一次结果到这一次结果都有哪些chunk和模块发生了变化
                socket.emit('hash', stats.hash);
                // 再向客户端发送一个ok
                socket.emit('ok')
            })
        });
        // 以监控的模块启动一次webpack编译，当编译成功之后执行回调
        compiler.watch({}, err => {
            console.log('又一次编译任务成功完成了')
        });
        // endregion
    }

    listen(port) {
        this.server.listen(port, () => {
            console.log(`服务器已经在${port}端口上启动了`)
        })
    }
}

// compiler代表整个webpack编译任务，全局只有一个
const compiler = webpack(config);

let server = new Server(compiler);
server.listen(8000);
