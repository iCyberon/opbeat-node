'use strict'

var test = require('tape')
var mockAgent = require('./_agent')

test('basic', function (t) {
  var expexted = [
    { transaction: 'foo0', signature: 't00', kind: 'type' },
    { transaction: 'foo0', signature: 't01', kind: 'type' },
    { transaction: 'foo0', signature: 'transaction', kind: 'transaction' },
    { transaction: 'foo1', signature: 't10', kind: 'type' },
    { transaction: 'foo1', signature: 't11', kind: 'type' },
    { transaction: 'foo1', signature: 'transaction', kind: 'transaction' }
  ]

  var agent = mockAgent(function (endpoint, data, cb) {
    var now = new Date()
    var ts = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())

    t.equal(endpoint, 'transactions')

    t.equal(data.transactions.length, 2)

    data.transactions.forEach(function (trans, index) {
      t.equal(trans.transaction, 'foo' + index)
      t.equal(trans.kind, 'bar' + index)
      t.equal(trans.result, 'baz' + index)
      t.equal(trans.timestamp, ts.toISOString())
      t.equal(trans.durations.length, 1)
      t.ok(trans.durations.every(Number.isFinite.bind(Number)))
    })

    t.equal(data.traces.raw.length, 2)
    t.equal(data.traces.groups.length, 6)

    data.traces.raw.forEach(function (raw) {
      t.ok(data.transactions.some(function (trans) {
        return ~trans.durations.indexOf(raw[0])
      }))
      t.ok(raw[1][0] in data.traces.groups)
      raw[1].every(function (n) {
        t.ok(n >= 0)
      })
    })

    t.equal(data.traces.raw.reduce(function (total, raw) {
      return total + raw[1].length
    }, 0), data.traces.groups.length)

    data.traces.groups.forEach(function (trace, index) {
      var trans = 0
      var rootTrans = expexted[index].signature === 'transaction'
      var parents = rootTrans ? [] : ['transaction']
      if (index > 2) trans++
      t.equal(trace.transaction, expexted[index].transaction)
      t.equal(trace.signature, expexted[index].signature)
      t.equal(trace.kind, expexted[index].kind)
      t.equal(trace.timestamp, ts.toISOString())
      t.deepEqual(trace.parents, parents)
      t.ok('_frames' in trace.extra)
      t.ok(Array.isArray(trace.extra._frames))
    })

    t.end()
  })
  var ins = agent._instrumentation

  generateTransaction(0, function () {
    generateTransaction(1, function () {
      ins._send()
    })
  })

  function generateTransaction (id, cb) {
    var trans = ins.startTransaction('foo' + id, 'bar' + id, 'baz' + id)
    var trace = startTrace(ins, 't' + id + '0', 'type')

    process.nextTick(function () {
      trace.end()
      trace = startTrace(ins, 't' + id + '1', 'type')
      process.nextTick(function () {
        trace.end()
        trans.end()
        cb()
      })
    })
  }
})

test('same tick', function (t) {
  var agent = mockAgent(function (endpoint, data, cb) {
    t.equal(data.traces.groups.length, 3)
    t.equal(data.traces.groups[0].signature, 't1')
    t.equal(data.traces.groups[1].signature, 't0')
    t.equal(data.traces.groups[2].signature, 'transaction')
    t.deepEqual(data.traces.groups[0].parents, ['transaction'])
    t.deepEqual(data.traces.groups[1].parents, ['transaction'])
    t.deepEqual(data.traces.groups[2].parents, [])
    t.end()
  })
  var ins = agent._instrumentation

  var trans = ins.startTransaction()
  var t0 = startTrace(ins, 't0')
  var t1 = startTrace(ins, 't1')
  t1.end()
  t0.end()
  trans.end()
  ins._send()
})

test('serial - no parents', function (t) {
  var agent = mockAgent(function (endpoint, data, cb) {
    t.equal(data.traces.groups.length, 3)
    t.equal(data.traces.groups[0].signature, 't0')
    t.equal(data.traces.groups[1].signature, 't1')
    t.equal(data.traces.groups[2].signature, 'transaction')
    t.deepEqual(data.traces.groups[0].parents, ['transaction'])
    t.deepEqual(data.traces.groups[1].parents, ['transaction'])
    t.deepEqual(data.traces.groups[2].parents, [])
    t.end()
  })
  var ins = agent._instrumentation

  var trans = ins.startTransaction()
  var t0 = startTrace(ins, 't0')
  process.nextTick(function () {
    t0.end()
    var t1 = startTrace(ins, 't1')
    process.nextTick(function () {
      t1.end()
      trans.end()
      ins._send()
    })
  })
})

test('serial - with parents', function (t) {
  var agent = mockAgent(function (endpoint, data, cb) {
    t.equal(data.traces.groups.length, 3)
    t.equal(data.traces.groups[0].signature, 't1')
    t.equal(data.traces.groups[1].signature, 't0')
    t.equal(data.traces.groups[2].signature, 'transaction')
    t.deepEqual(data.traces.groups[0].parents, ['transaction'])
    t.deepEqual(data.traces.groups[1].parents, ['transaction'])
    t.deepEqual(data.traces.groups[2].parents, [])
    t.end()
  })
  var ins = agent._instrumentation

  var trans = ins.startTransaction()
  var t0 = startTrace(ins, 't0')
  process.nextTick(function () {
    var t1 = startTrace(ins, 't1')
    process.nextTick(function () {
      t1.end()
      t0.end()
      trans.end()
      ins._send()
    })
  })
})

test('stack branching - no parents', function (t) {
  var agent = mockAgent(function (endpoint, data, cb) {
    t.equal(pointerChain(t0), 't0 -> transaction')
    t.equal(pointerChain(t1), 't1 -> transaction')

    t.equal(data.traces.groups.length, 3)
    t.equal(data.traces.groups[0].signature, 't0')
    t.equal(data.traces.groups[1].signature, 't1')
    t.equal(data.traces.groups[2].signature, 'transaction')
    t.deepEqual(data.traces.groups[0].parents, ['transaction'])
    t.deepEqual(data.traces.groups[1].parents, ['transaction'])
    t.deepEqual(data.traces.groups[2].parents, [])
    t.end()
  })
  var ins = agent._instrumentation

  var trans = ins.startTransaction()
  var t0 = startTrace(ins, 't0') // 1
  var t1 = startTrace(ins, 't1') // 2
  setTimeout(function () {
    t0.end() // 3
  }, 25)
  setTimeout(function () {
    t1.end() // 4
    trans.end()
    ins._send()
  }, 50)
})

function pointerChain (trace) {
  var arr = [trace.signature]
  var prev = trace._parent
  while (prev) {
    arr.push(prev.signature)
    prev = prev._parent
  }
  return arr.join(' -> ')
}

function startTrace (ins, signature, type) {
  var trace = ins.buildTrace()
  if (trace) trace.start(signature, type)
  return trace
}
