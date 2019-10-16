class Emitter {
    constructor() {
        this.listeners = {}
    }

    on(type, listener) {
        this.listeners[type] = listener
    }

    emit(type) {
        this.listeners[type] && this.listeners[type]()
    }
}

let hotCurrentHash; // lastHash 上一次 hash值
let currentHash; // 这一次的hash值

// region websocket 通信

let socket = io('/');
// 更新 hash
socket.on('hash', (hash) => {
    currentHash = hash
});
// 更新 app
socket.on('ok', () => {
    reloadApp(true)
});

// 执行热更新，或者重新刷新app
function reloadApp(hot) {
    if (hot) { // 如果hot为true 走热更新的逻辑
        hotEmitter.emit('webpackHotUpdate')
    } else { // 如果不支持热更新，则直接重新加载
        window.location.reload()
    }
}

socket.on('connect', () => {
    console.log('客户端连接成功')
});

// endregion

// region 热更新处理逻辑
let hotEmitter = new Emitter();

hotEmitter.on('webpackHotUpdate', () => {
    if (!hotCurrentHash || hotCurrentHash == currentHash) {
        return hotCurrentHash = currentHash
    }
    hotCheck()
});

function hotCheck() {
    hotDownloadManifest().then(update => {
        let chunkIds = Object.keys(update.c);
        chunkIds.forEach(chunkId => {
            hotDownloadUpdateChunk(chunkId)
        })
    })
}

// 此方法用来去询问服务器到底这一次编译相对于上一次编译改变了哪些chunk?哪些模块?
function hotDownloadManifest() {
    return new Promise(function (resolve) {
        let request = new XMLHttpRequest();
        //hot-update.json文件里存放着从上一次编译到这一次编译 取到差异
        let requestPath = '/' + hotCurrentHash + ".hot-update.json";
        request.open('GET', requestPath, true);
        request.onreadystatechange = function () {
            if (request.readyState === 4) {
                let update = JSON.parse(request.responseText);
                resolve(update)
            }
        };
        request.send()
    })
}

function hotDownloadUpdateChunk(chunkId) {
    let script = document.createElement('script');
    script.charset = 'utf-8';
    // /main.xxxx.hot-update.js
    script.src = '/' + chunkId + "." + hotCurrentHash + ".hot-update.js";
    document.head.appendChild(script)
}

// 在 webpack 打包出的 update chunk 中会调用该方法
// 当客户端把最新的代码拉到浏览之后
window.webpackHotUpdate = function (chunkId, moreModules) {
    // 循环新拉来的模块
    for (let moduleId in moreModules) {
        // 从模块缓存中取到老的模块定义
        let oldModule = __webpack_require__.c[moduleId];
        // parents哪些模块引用这个模块 children这个模块引用了哪些模块
        // parents=['./src/index.js']
        let {
            parents,
            children
        } = oldModule;
        // 更新缓存为最新代码 缓存进行更新
        let module = __webpack_require__.c[moduleId] = {
            i: moduleId,
            l: false,
            exports: {},
            parents,
            children,
            hot: window.hotCreateModule(moduleId)
        };
        moreModules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
        module.l = true; // 状态变为加载就是给module.exports 赋值了
        parents.forEach(parent => {
            debugger; // parents=['./src/index.js']
            let parentModule = __webpack_require__.c[parent];
            // _acceptedDependencies={'./src/title.js',render}
            parentModule && parentModule.hot && parentModule.hot._acceptedDependencies[moduleId] && parentModule.hot._acceptedDependencies[moduleId]()
        });
        hotCurrentHash = currentHash
    }
};

window.hotCreateModule = function () {
    let hot = {
        _acceptedDependencies: {},
        dispose() {
            // 销毁老的元素
        },
        accept: function (deps, callback) {
            for (let i = 0; i < deps.length; i++) {
                // hot._acceptedDependencies={'./title': render}
                hot._acceptedDependencies[deps[i]] = callback
            }
        }
    };
    return hot
};
// endregion
