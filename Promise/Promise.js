export default class MyPromise {
    //构造函数中传入一个executor函数，此函数接受两个参数，resolve,reject
    constructor(executor) {
        this.state = 'pending'; // 初始状态
        this.value = undefined; // 成功的值
        this.reason = undefined; // 失败的原因
        this.onFulfilledCallbacks = []; // 成功回调队列
        this.onRejectedCallbacks = []; // 失败回调队列

        //resolve函数将promise状态变为fulfilled
        //同时检查是否有注册的成功回调，如果有则立即执行(因为then中回调方法执行时resolve还不一定被调用过)(then方法的调用是同步的,resolve却可能是异步的)
        const resolve = (value) => {
            if (this.state === 'pending') {
                this.state = 'fulfilled';
                this.value = value;
                this.onFulfilledCallbacks.forEach((cb) => cb(value));
            }
        };
        //reject函数将promise状态变为rejected
        //同理需要检查注册的失败回调
        const reject = (reason) => {
            if (this.state === 'pending') {
                this.state = 'rejected';
                this.reason = reason;
                this.onRejectedCallbacks.forEach((cb) => cb(reason));
            }
        };
        //构造函数的执行部分，尝试向executor中传入上面定义的resolve,reject,如果发生错误则将错误传给reject函数(也就是即使executor中代码有错程序也不会崩溃)
        try {
            executor(resolve, reject);
        } catch (err) {
            reject(err);
        }
    }
    //then方法接受两个回调函数,分别处理当前promise的可能的两个状态(fulfilled,rejected)
    //始终会返回一个新的Promise对象
    then(onFulfilled, onRejected) {

        onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : (value) => value;
        //一般.then()写法中不会传入onRejected,这时如果前一个then返回的promise是rejected,就会调用这个默认的处理方法,then会return一个状态为rejected(reason)的promise(其实和原先的promise一样),最终会一路传导catch中
        onRejected = typeof onRejected === 'function' ? onRejected : (reason) => { throw reason; };

        return new MyPromise((resolve, reject) => {
            //一般写法中,then会执行就代表promise是fulfilled，这时将onFulfilled()的调用加入微任务队列(传入resolve中的值),等待事件循环机制的执行
            //其中onFulfilled执行方法就和promise中executor的执行方法基本一致了(但要注意onFulfilled的返回值是不是promise)
            if (this.state === 'fulfilled') {
                queueMicrotask(() => {
                    try {
                        const result = onFulfilled(this.value);
                        // 如果返回值是Promise，递归解析
                        if (result instanceof MyPromise) {
                            result.then(resolve, reject);
                        } else {
                            resolve(result);
                        }
                    } catch (err) {
                        reject(err);
                    }
                });
            }
            //这里通常是catch函数被调用时的情况(也就是promise为rejected,catch传入(null,onRejected))
            //同样将onRejected()加入微任务，同时传入rejected中的值
            else if (this.state === 'rejected') {
                queueMicrotask(() => {
                    try {
                        const result = onRejected(this.reason);
                        // 如果返回值是Promise，递归解析
                        if (result instanceof MyPromise) {
                            result.then(resolve, reject);
                        } else {
                            resolve(result);
                        }
                    } catch (err) {
                        reject(err);
                    }
                });
            }
                //当executor中的同步代码执行完时,constructor也就执行完了,这时promise就相当于创建了，可以调用后续方法了
                //但是这时promise的状态却有可能是pending(也就是executor中异步调用resolve或reject)
                //所以需要将onFulfilled(包装成注册微任务的函数)传入onFulfilled回调列表中
            else if (this.state === 'pending') {
                this.onFulfilledCallbacks.push(() => {
                    queueMicrotask(() => {
                        try {
                            const result = onFulfilled(this.value);
                            resolve(result);
                        } catch (err) {
                            reject(err);
                        }
                    });
                });

                this.onRejectedCallbacks.push(() => {
                    queueMicrotask(() => {
                        try {
                            const result = onRejected(this.reason);
                            resolve(result);
                        } catch (err) {
                            reject(err);
                        }
                    });
                });
            }
        });
    }
    //catch方法等效于then(null, onRejected)
    catch(onRejected) {
        return this.then(null, onRejected);
    }

    //无论promise状态为何finally中的callback都必然执行
    //如果状态为fulfilled,则返回resolve中的值(value值)
    //如果状态为rejected,则抛出错误(reason值)
    finally(callback) {
        return this.then(
            (value) => {
                callback();
                return value;
            },
            (reason) => {
                callback();
                throw reason;
            }
        );
    }

    //Promise.all()静态方法,用一个Promise来包裹所有传入的promise,任意promise失败都会导致大promise失败,只有全部成功大promise才会resolve(包含所有promise的value的数组)
    static all(iterable) {
        return new MyPromise((resolve, reject) => {
            const promises = Array.from(iterable);
            // 处理空迭代对象
            if (promises.length === 0) {
                return resolve([]);
            }
            // 存储结果的数组
            const results = new Array(promises.length);
            let resolvedCount = 0;
            // 遍历每个 Promise
            promises.forEach((item, index) => {
                MyPromise.resolve(item)
                    .then((value) => {
                        // 存储结果到对应索引
                        results[index] = value;
                        resolvedCount++;

                        // 当所有 Promise 都 resolved 时，resolve 结果数组
                        if (resolvedCount === promises.length) {
                            resolve(results);
                        }
                    })
                    .catch((error) => {
                        // 任何一个 Promise reject，立即 reject
                        reject(error);
                    });
            });
        });
    }

    //静态方法resolve，将value包装为resolved状态的Promise
    static resolve(value) {
        // 如果value是个promise,直接返回
        if (value instanceof MyPromise) {
            return value;
        }
        // 创建一个状态为resolved的promise,其value为value
        return new MyPromise((resolve) => resolve(value));
    }

    // 静态方法reject，创建rejected状态的Promise
    static reject(reason) {
        return new MyPromise((_, reject) => reject(reason));
    }
}

