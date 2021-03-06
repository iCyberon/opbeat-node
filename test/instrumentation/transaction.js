'use strict'

var test = require('tape')
var mockInstrumentation = require('./_instrumentation')
var Transaction = require('../../lib/instrumentation/transaction')
var Trace = require('../../lib/instrumentation/trace')

test('init', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.ok(false)
  })
  var trans = new Transaction(ins._agent, 'name', 'type', 'result')
  t.equal(trans.name, 'name')
  t.equal(trans.type, 'type')
  t.equal(trans.result, 'result')
  t.equal(trans.ended, false)
  t.deepEqual(trans.traces, [])
  t.end()
})

test('#end() - no traces', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.equal(added.ended, true)
    t.equal(added, trans)
    t.equal(trans.traces.length, 1)
    t.deepEqual(trans.traces, [trans._rootTrace])
    t.end()
  })
  var trans = new Transaction(ins._agent)
  trans.end()
})

test('#end() - with traces', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.equal(added.ended, true)
    t.equal(added, trans)
    t.equal(trans.traces.length, 2)
    t.deepEqual(trans.traces, [trace, trans._rootTrace])
    t.end()
  })
  var trans = new Transaction(ins._agent)
  var trace = new Trace(trans)
  trace.start()
  trace.end()
  trans.end()
})

test('#duration()', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.ok(added.duration() >= 25)
    t.ok(added.duration() < 35)
    t.end()
  })
  var trans = new Transaction(ins._agent)
  setTimeout(function () {
    trans.end()
  }, 25)
})

test('#duration() - un-ended transaction', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.ok(false)
  })
  var trans = new Transaction(ins._agent)
  t.equal(trans.duration(), null)
  t.end()
})
