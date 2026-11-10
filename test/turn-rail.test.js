import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialState, apply, view } from '../lib/model.js'

function event(type, seq, data, extra={}) { return {type,seq,time:seq+100,data,...extra} }

test('rollback publishes hidden turn set for transcript and navigation consumers', () => {
  const log = [
    event('turn/start',0,{turn:1}),
    event('user/message',1,{id:'u1',role:'user',source:{kind:'user'},content:[{type:'text',text:'one'}]},{surfaceOp:'append'}),
    event('assistant/message',2,{turn:1,step:1,message:{id:'a1',role:'assistant',source:{kind:'model',model:'m'},content:[{type:'text',text:'answer'}]},stream:[]},{surfaceOp:'append'}),
    event('turn/end',3,{turn:1,reason:{kind:'completed'}}),
    event('turn/start',4,{turn:2}),
    event('user/message',5,{id:'u2',role:'user',source:{kind:'user'},content:[{type:'text',text:'two'}]},{surfaceOp:'append'}),
    event('assistant/message',6,{turn:2,step:1,message:{id:'a2',role:'assistant',source:{kind:'model',model:'m'},content:[{type:'text',text:'answer'}]},stream:[]},{surfaceOp:'append'}),
    event('turn/end',7,{turn:2,reason:{kind:'completed'}}),
    event('developer/message',8,{turn:2,step:1,message:{id:'d8',role:'developer',source:{kind:'dsh-chat-plus',v:1,op:'rollback',turn:2},content:[]}},{surfaceOp:{op:'replace',startSeq:5,endSeq:6},sourceEventSeqs:[5,6]}),
  ]
  const state=log.reduce(apply,initialState())
  assert.equal(view(state).hidden['2'],'all')
  assert.deepEqual(view(state).hidden['1'],undefined)
})
