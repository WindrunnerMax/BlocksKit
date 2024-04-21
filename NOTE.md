# NOTE

## Blocks
我思考了很长时间如何设计`Block`化的编辑器，除了对于交互上的设计比较难做之外，对于数据的设计也没有什么比较好的想法，特别是实际上是要管理一棵树形结构，并且同时还需要支持对富文本内容的描述，所以最开始我想的是分别管理树结构与引用关系。这样当然是没有问题的，只不过看起来并没有那么清晰，特别是还要设计完备的插件化类型支持，这部分可能就没有那么好做了。

后来，我想是不是可以单独将`Blocks`类型放在单独的包里，专门用来管理整棵树的描述，以及类型的扩展等等，而且在扩展类型时不会因为重新`declare module`导致不能实际引用原本的包结构，当然单独引用独立的模块用来做扩展也是可以的。此外，这里就不再单独维护树结构与引用关系了，每个块都会携带自己的引用关系，即`parent`与`children`，当然在编辑器的实际对象中也需要维护状态树，在状态树里需要维护基本的数据操作。

## 多实例Editor
通过多个实例来实现嵌套`Blocks`，实际上这里边的坑会有很多，需要禁用大量的编辑器默认行为并且重新实现，例如`History`、`Enter`回车操作、选区变换等等，可以预见这其中需要关注的点会有很多，但是相对于从零实现编辑器需要适配的各种浏览器兼容事件还有类似于输入事件的处理等等，这种管理方式还算是可以接受的。