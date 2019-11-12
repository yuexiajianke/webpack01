let fs = require('fs')
let path = require('path')
let babylon = require('babylon')
let t = require('@babel/types')
let traverse = require('@babel/traverse').default
let generator = require('@babel/generator').default
let ejs = require('ejs')

//babylon 主要就是把源码转换成ast
//@babel/traverse 主要是遍历到对应的节点
//@babel/types 把遍历到的节点替换一下
//@babel/generator 把替换后的结果生成一下

class Compiler {
    constructor(config) {
        // entry output
        this.config = config

        //保存入口文件的路径
        this.entryId;

        this.entry = config.entry //入口路径
        //工作路径
        this.root = process.cwd()
        //需要保存所有的模块依赖
        this.modules = {}
    }
    getSource (modulePath) {
        return fs.readFileSync(modulePath, 'utf8') 
    }
    parse (source, parentPath) {  //AST解析语法树
        let ast = babylon.parse(source)
        let dependencies = [] //依赖的数组
        traverse(ast, {
            CallExpression(p) {
                let node = p.node
                if (node.callee.name === 'require') {
                    node.callee.name = '__webpack_require__'
                    let moduleName = node.arguments[0].value //取到的是模块的引用的名字
                    moduleName = moduleName + (path.extname(moduleName) ? '' : '.js')
                    moduleName = './' + path.join(parentPath, moduleName)
                    dependencies.push(moduleName)
                    node.arguments = [t.stringLiteral(moduleName)]
                }
            }
        })
        let sourceCode = generator(ast).code
        return { sourceCode, dependencies}

    }
    buildModule (modulePath, isEntry) {
        let source = this.getSource(modulePath)
        //拿到模块的内容
        //模块id modulePath modulePath - this.root 
        let moduleName = './' + path.relative(this.root, modulePath)
        //console.log(source, moduleName)

        if (isEntry) {
            this.entryId = moduleName //保存入口的名字
        }
        //解析需要把source源码进行改造返回一个依赖列表
        let { sourceCode, dependencies } = this.parse(source, path.dirname(moduleName))

        console.log(sourceCode, dependencies)

        this.modules[moduleName] = sourceCode

        dependencies.forEach(dep => { //附属模块的加载，递归加载
            this.buildModule(path.join(this.root, dep), false)
        })
    }
    emitFile () { //发射文件
        //用数据渲染我们的模版
        //拿到输出到哪个目录下 输出路径
        let main = path.join(this.config.output.path, this.config.output.filename)
        //模板路径
        let templateStr = this.getSource(path.join(__dirname, 'main.ejs'))
        let code = ejs.render(templateStr, {entryId: this.entryId, modules: this.modules})
        this.assets = {}
        this.assets[main] = code
        fs.writeFileSync(main, this.assets[main]) 
    }
    run () {
        //执行  并且创建模块的依赖关系
        this.buildModule(path.resolve(this.root, this.entry), true)

        //发射一个文件 打包后的文件
        this.emitFile()  


    }


}

module.exports = Compiler