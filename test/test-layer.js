/* test-layer.js
 *
 * A test of layers and nested layers.
 *
 */

const assert = require( 'assert' )
const parser = require( '../dist/tidal.js' )

describe( 'Testing layers.', () => {

  it( 'Commas should return a groups marked as part of layers (polyrhythms)', () => {

    const expected = {
      type:'layers',
      values:[
        {
          type:'group',
          values:[
            { type:'number', value:0 },
            { type:'number', value:1 },
            { type:'number', value:2 }
          ]
        },
        {
          type:'group',
          values:[
            { type:'number', value:3 },
            { type:'number', value:4 }
          ]
        }
      ]
    }

    const result = parser.parse( '[ 0 1 2, 3 4 ]' )

    assert.deepEqual( result, expected )
  })

  /*
  if ('Commas in a nested group should return group marked as layer', () => {

    const expected = {
      '0': {
        '0': {type: 'number', value:1},
        '1/3': {type: 'number', value:2},
        '2/3': {type: 'number', value: 3},
        type: 'group'
      },
      '1/3':{
        '0': {
          '0': {type: 'number', value: 4},
          '1/2': {type: 'number', value: 5},
          type: 'group'
        },
        '1/2': {type: 'number', value: 6}
      },
      '2/3': {
        '0': {type: 'number', value: 7},
        '1/2': {type: 'number', value: 8},
        type: 'group'
      },
      type: 'layer'
    };

    const result  = parser.parse('[1 2 3, [4 5] 6, 7 8]')[0]

  });

  */


});
