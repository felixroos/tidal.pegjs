/* test-repeat.js
 *
 * A tests for repeats in Tidal.
 *
 */

const assert = require( 'assert')
const parser = require('../dist/tidal.js')
const queryArc = require( '../queryArc.js' )
const Fraction = require( 'fraction.js' )
const util     = require( 'util' )

describe( "Testing repeats with '*'", () => {

  it( 'should generate a 2x repeat on a number.', () => {

    const expected = {
      type: 'repeat',
      operator:'*',
      rate: { type: 'number', value: 2 },
      value: { type:'number', value:0 }
    }

    const result = parser.parse( '0*2' )

    assert.deepEqual(result, expected)

  })


  it( 'should generate a 2x repeat on a group pattern', () => {
    const expected = {
      type:'repeat',
      operator: '*',
      rate:{ type:'number', value:2 },
      value: {
        type:'group',
        values:[
          { type:'number', value:2 },
          { type:'number', value:1 },
        ]
      }
    }

    const result = parser.parse( '[2 1]*2' )

    assert.deepEqual( result, expected )

  })

  it( 'should generate two events given "0*2" and a duration of 1' , () => {
    const expected = [
      { value:0, arc:{ start:Fraction(0), end:Fraction(1,2) } },
      { value:0, arc:{ start:Fraction(1,2), end:Fraction(1) } }
    ]

    const pattern = parser.parse( '0*2' )
    const result = queryArc( pattern, Fraction(0), Fraction(1) )
    assert.deepEqual( result, expected )

    })
    

  it( 'should generate one events given "0/2" and a duration of 2' , () => {
    const expected = [
      { value:0, arc:{ start:Fraction(0), end:Fraction(2) } },
    ]

    const pattern = parser.parse( '0/2' )
    const result = queryArc( pattern, Fraction(0), Fraction(1) )

    assert.deepEqual( result, expected )

  })
  
  /*
  it( 'should generate two events given "[0 1]/2" and a duration of 2' , () => {
    const expected = [
      { value:0, arc:{ start:Fraction(0), end:Fraction(1) } },
      { value:1, arc:{ start:Fraction(1), end:Fraction(2) } },
    ]

    const pattern = parser.parse( '[0 1]/2' )
    const result = queryArc( pattern, Fraction(0), Fraction(2) )

    console.log( 'result:', util.inspect( result, { depth:3 } ) )
    assert.deepEqual( result, expected )

    })
    */
 })
