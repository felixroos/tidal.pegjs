const Fraction = require( 'fraction.js' )
const util     = require( 'util' )
const bjork    = require( 'bjork' ) 
const log      = util.inspect

/* queryArc
 *
 * Generates events for provided pattern, starting at
 * an initial phase, subdivides queries in individual 
 * cycles if duration of query is greater than 1 cycle.
 * Filters events outside of the the intended range. 
 * Remaps events to be relative to the initial phase.
 */
const queryArc = function( pattern, phase, duration ) {
  const start         = phase.clone(),
        end           = start.add( duration ),
        // get phase offset if scheduling begins in middle of event arc
        adjustedPhase = adjustPhase( phase, getPhaseIncr( pattern ), end )

  let eventList

  // if we're querying an arc that is less than or equal to one cycle in length..
  if( duration.valueOf() <= 1 ) {
    eventList = processPattern( 
      pattern, 
      duration, 
      adjustedPhase, 
      null, 
      null, 
      false//shouldRemap( pattern ) 
    )
  }else{
    // for longer arcs we need to query one cycle at a time
    eventList = []
    let count = 0
    for( let i = adjustedPhase.valueOf(); i < adjustedPhase.add( duration ).valueOf(); i++ ) {
      eventList = eventList.concat( 
        processPattern( 
          pattern, 
          Fraction(1),
          adjustedPhase.add( count++ ), 
          null, 
          null, 
          false
        )
      )
    }
  }

  // prune any events that fall before our start phase or after our end phase
  eventList = eventList.filter( evt => {
    return evt.arc.start.valueOf() >= start.valueOf() 
        && evt.arc.start.valueOf() <  end.valueOf()
  })
  // remap events to make their arcs relative to initial phase argument
  .map( evt => {
    evt.arc.start = evt.arc.start.sub( start )
    evt.arc.end   = evt.arc.end.sub( start )
    return evt
  })
 
  //console.log( 'eventList:', log(eventList,{depth:4}) )
  return eventList
}

// if an event is found that represents a pattern (as opposed to a constant) this function
// is called to query the pattern and map any generated events to the appropriate timespan
const processPattern = ( pattern, duration, phase, phaseIncr=null, override = null, shouldRemapArcs=false ) => {
  //if( phaseIncr !== null ) debugger
  let events = handlers[ pattern.type ]( 
    [], 
    pattern, 
    /*shouldReset( pattern ) === true ? Fraction(0) :*/ phase.clone(), 
    // XXX this is confusing. we are getting around a problem
    // with polymeters where duplicate events are generated by
    // not passing a phaseIncr... it's not needed since there's an
    // override. But this doesn't seem like correct way to solve
    // this problem and will probably cause future problems...
    phaseIncr !== null ? duration.div( phaseIncr ) : duration, 
    override 
  )

  // if needed, remap arcs for events
  if( shouldRemapArcs === true ) {
    if( phaseIncr === null ) phaseIncr = getPhaseIncr( pattern )
    events = events.map( v => ({
      value: v.value,
      arc: getMappedArc( v.arc, phase.clone(), phaseIncr )
    }) )
  }
 
  return events 
}
// placeholder for potentially adding more goodies (parent arc etc.) later
const Arc = ( start, end ) => ({ start, end })

const shouldNotRemap = ['polymeter', 'onestep']
const shouldRemap = pattern => shouldNotRemap.indexOf( pattern.type ) === -1

// XXX seems like getMappedArc should be changed to what onestep and group are now using?
// would that change work with how getMappedArc is used in processPattern?

// map arc time values to appropriate durations
const getMappedArc = ( arc, phase, phaseIncr ) => {
  let mappedArc
  
  if( phase.mod( phaseIncr ).valueOf() !== 0 ) {
    mappedArc = Arc( 
      arc.start.mul( phaseIncr ).add( phase ), 
      arc.end.mul( phaseIncr ).add( phaseIncr.mod( phase ) ) 
    )
  }else{
    mappedArc = Arc( 
      arc.start.mul( phaseIncr ).add( phase ), 
      arc.end.mul( phaseIncr ).add( phase ) 
    )
  }
  
  return mappedArc
}

// if initial phase is in the middle of an arc, advance to the end by calculating the difference
// between the current phase and the start of the next arc, and increasing phase accordingly.
const adjustPhase = ( phase, phaseIncr, end ) => phase.valueOf() === 0 
  ? Fraction(0) 
  : phase.sub( phase.mod( phaseIncr ) )

// check to see if phase should advance to next event, or, if next event is too far in the future, to the
// end of the current duration being requested.
const advancePhase = ( phase, phaseIncr, end ) => phase + phaseIncr <= end ? phase.add( phaseIncr ) : end 

// calculate the duration of the current event being processed.
const calculateDuration = ( phase, phaseIncr, end ) => phase + phaseIncr <= end ? phaseIncr : end.sub( phase )

// get an index number for a pattern for a particular phase
const getIndex = ( pattern, phase ) => {
  let idx = 0
  if( pattern.options !== undefined ) {
    if( pattern.options.overrideIncr === true ) {
      idx = phase.div( pattern.options.incr ).mod( pattern.values.length ).floor()
    }
  }else{
    // default list behavior
    idx = phase.mul( Fraction( pattern.values.length ) ).mod( pattern.values.length ).floor()
  }

  return idx.valueOf()
}

// in addition to 'fast', phase resets are also necessary when indexing subpatterns,
// which are currently arrays with no defined .type property, hence the inclusion of
// undefined in the array below
const shouldResetPhase = [ 'repeat', undefined, 'group', 'layers' ] 

// XXX does these need to look at all parents recursively? Right now we're only using one generation...
const shouldReset = pattern => {
  const reset = shouldResetPhase.indexOf( pattern.type ) > -1 
  const parent = pattern.parent !== undefined && shouldResetPhase.indexOf( pattern.parent.type ) > -1

  return reset && parent
}

// I assume this will need to be a switch on pattern.type in the future...
const getPhaseIncr = pattern => {
  let incr

  switch( pattern.type ) {
    case 'polymeter': incr = Fraction( 1, pattern.left.values.length ); break;
    case 'number': case 'string': incr = Fraction( 1 ); break;
    case 'onestep': incr = null; break;
    default: incr = pattern.values !== undefined ? Fraction( 1, pattern.values.length ) : Fraction(1); break;
  }

  return incr
}

const handlers = {
  rest( state ) { return state },

  // standard lists e.g. '0 1 2 3' or '[0 1 2]'
  group( state, pattern, phase, duration, overrideIncr=null ) {
    const start     = phase.clone(),
          end       = start.add( duration ),
          phaseIncr = overrideIncr === null 
            ? getPhaseIncr( pattern ) 
            : overrideIncr
          
    let eventList = []

    //console.log( 
    //  'type:',  pattern.type, 
    //  'phase:', phase.toFraction(),
    //  'incr:',  phaseIncr.toFraction(),
    //  'dur:',   duration.toFraction()
    //)
    
    while( phase.compare( end ) < 0 ) {
      // if pattern is a list, read using current phase, else read directly
      const member = Array.isArray( pattern.values ) === true 
        ? pattern.values[ getIndex( pattern, phase ) ] 
        : pattern.value

      // get duration of current event being processed
      const dur = calculateDuration( phase, phaseIncr, end )

      // if value is not a numeric or string constant (if it's a pattern)...
      if( member === undefined || (isNaN( member.value ) && typeof member.value !== 'string') ) {
        // query the pattern and remap time values appropriately 
        if( member !== undefined ) member.parent = pattern
        //console.log( 'processing ', pattern.type, member.type, dur.toFraction(),  phaseIncr.toFraction() )
        const events = processPattern( 
          member, 
          Fraction(1), 
          member.type !== 'slow' ? Fraction(0) : phase.clone(), 
          null, //getPhaseIncr(member), 
          null, 
          false//shouldRemap( member )
        )
        .map( evt => {
          evt.arc.start = evt.arc.start.mul( dur ).add( phase )
          evt.arc.end   = evt.arc.end.mul( dur ).add( phase )
          return evt
        })

        eventList = eventList.concat( events )
      }else{
        // XXX shouldn't we just process all patterns???
        // member does not need further processing, so add to event list
        const evt = { 
          value:member.value, 
          arc:Arc( phase, phase.add( dur ) ),
        }
        if( member.uid !== undefined ) evt.uid = member.uid 

        eventList.push( evt )
      }

      // assuming we are starting / ending at a regular phase increment value...
      if( phase.mod( phaseIncr ).valueOf() === 0 ) {
        phase = advancePhase( phase, phaseIncr, end )
      }else{
        // advance phase to next phase increment
        phase = phase.add( phaseIncr.sub( phase.mod( phaseIncr ) ) ) 
      }
    }

    // prune any events that fall before our start phase or after our end phase
    eventList = eventList.filter( evt => {
      return evt.arc.start.valueOf() >= start.valueOf() && evt.arc.start.valueOf() < end.valueOf()
    })
   
    return state.concat( eventList )
  },

  bjorklund( state, pattern, phase, duration ) {
    const onesAndZeros = bjork( pattern.pulses.value, pattern.slots.value )
    let rotation = pattern.rotation !== null ? pattern.rotation.value : 0
    
    // rotate right
    if( rotation > 0 ) {
      while( rotation > 0 ) {
        const right = onesAndZeros.pop()
        onesAndZeros.unshift( right )
        rotation--
      }
    } else if( rotation < 0 ) {
      // rotate left
      while( rotation < 0 ) {
        const left = onesAndZeros.shift()
        onesAndZeros.push( left )
        rotation++
      }
    }
    
    const slotDuration = duration.div( pattern.slots.value )
    const valueIsValue = pattern.value.type === 'number' || pattern.value.type === 'string'

    const events = onesAndZeros.map( ( shouldInclude, i, arr ) => {
      let evt
      // don't process unless an actual event will be included...
      if( shouldInclude === 1 ) {
        const startPhase = phase.add( slotDuration.mul( i ) )
        evt = {
          shouldInclude,
          // XXX is there a case where we should use more than 
          // the first value by querying the value pattern?
          value:valueIsValue ? pattern.value : processPattern( pattern.value, slotDuration, startPhase )[0].value,
          arc:Arc( startPhase, startPhase.add( slotDuration ) ) 
        }
      }else{
        evt = { shouldInclude }
      }

      return evt
    })
    .filter( evt => {
      let shouldInclude = evt.shouldInclude

      // needed to pass tests and is also cleaner...
      delete evt.shouldInclude
      return shouldInclude === 1
    })

    events.forEach( evt => state.push( evt ) )
    
    return state
  },

  onestep( state, pattern, phase, duration ) {
    pattern.values.forEach( group => {
      // initialize, then increment. this assumes that the pattern will be parsed once,
      // and then the resulting data structure will be queried repeatedly, enabling the use
      // of state.
      group.count = group.count === undefined ? 0 : group.count + 1

      const subpattern = group.values[ group.count % group.values.length ]
      const dur = duration.valueOf() <= 1 ? Fraction(1) : duration 
      const durDiff = duration.mul( dur ) 

      const events = processPattern( 
        subpattern, 
        dur,
        Fraction(0), 
        null,
        null,null,true
      ).map( evt => {
        evt.arc.start = evt.arc.start.mul( duration ).add( phase )
        evt.arc.end = evt.arc.end.mul( duration ).add( phase )

        return evt
      })  

      state.push( ...events )
    })

    return state
  },

  number( state, pattern, phase, duration ) {
    //if( phase.valueOf() === 0 ) {
      const evt = { arc:Arc( phase, phase.add( duration ) ), value:pattern.value }
      if( pattern.uid !== undefined ) evt.uid = pattern.uid
      state.push(evt)
    //}
    return state 
  },

  string( state, pattern, phase, duration ) {
    const evt = { arc:Arc( phase, phase.add( duration ) ), value:pattern.value }
    if( pattern.uid !== undefined ) evt.uid = pattern.uid
    state.push(evt)
    return state 
  },

  degrade( state, pattern, phase, duration ) {
    if( Math.random() > .5 ) {
      const evt = { 
        arc:Arc( phase, phase.add( duration ) ), 
        value:pattern.value
      }

      if( pattern.uid !== undefined ) evt.uid = pattern.uid

      state.push( evt )
    }

    return state 
  },

  polymeter( state, pattern, phase, duration ) {
    pattern.left.parent = pattern.right.parent = pattern

    const incr  = Fraction( 1, pattern.left.values.length )
    const left  = processPattern( pattern.left, duration, phase.clone(), duration, incr, false )

    pattern.right.options = { overrideIncr: true, incr }
    const right = processPattern( pattern.right, duration, phase.clone(), duration, incr, false ) 

    return state.concat( left ).concat( right )
  },

  layers( state, pattern, phase, duration ) {
    console.log( 'layer phase:', phase.toFraction(), log( pattern.values, { depth:4 }) )
    //pattern.left.parent = pattern.right.parent = pattern
    for( const group of pattern.values ) {
      const incr = getPhaseIncr( group )
      const events = processPattern( group, duration.clone(), phase.clone(), duration, null, false)
      // not sure why excess events are generated, but they need to be filtered...
      .filter( evt => 
        evt.arc.start.valueOf() >= phase.valueOf() 
        && evt.arc.start.valueOf() < phase.add( duration ).valueOf()
      )
      
      //console.log( 'group:', util.inspect( group, { depth:3 }) )
      //console.log( 'state:', util.inspect( events, { depth:3 }))
      state = state.concat( events )
    }

    return state
  },

  slow( state, pattern, phase, duration ) {
    const speed = pattern.rate.value

    const events = queryArc(
      pattern.value,
      phase.div( speed ),
      duration.div( speed )
    )
    //const events = processPattern(
    //  pattern.value,
    //  duration,//.div( speed ),
    //  phase, //phase.div( speed )
    //)
    .map( evt => {
      evt.arc.start = evt.arc.start.mul( speed ).add( phase )
      evt.arc.end   = evt.arc.end.mul( speed ).add( phase )
      return evt
    })
    //.filter( evt => evt.arc.start.valueOf() < phase.add( duration.div( speed ) ).valueOf() )

    return state.concat( events )
  },

//const processPattern = ( pattern, duration, phase, phaseIncr=null, override = null, shouldRemapArcs=true ) => {
  speed( state, pattern, phase, duration ) {
    // the general process of increasing the speed of a pattern is to query
    // for a longer duration according to the speed, and the scale the resulting
    // events.
    
    // following explanation from yaxu for how subpatterns work with rates...
    // https://talk.lurk.org/channel/tidal?msg=z5ck73H9EvxQwMqq6 
    // re: pattern a*[2 4 8]
    // "Anyway what happens in this kind of situation is that it splits the cycle in three, 
    // each a window on what would have happened if you'd have sped things up by the given number
    // so for the first third you'd get a third of two a's
    // for the second third you'd get the second third of four a's..."
    
    const speed = pattern.rate.value
    const events = queryArc(
      pattern.value,
      Fraction(0),
      duration.mul( speed ) 
    ).map( evt => {
      evt.arc.start = evt.arc.start.div( speed ).add( phase )
      evt.arc.end   = evt.arc.end.div( speed ).add( phase )
      return evt
    })

    // XXX account for having a speeds pattern!!!!
    /*
    
    const incr = Fraction(1, speeds.length)
    const speeds = queryArc( pattern.rate, Fraction(0), Fraction(1) )

    for( let i = 0; i < speeds.length; i++ ) {
      let speed = speeds[ i ].value

      if( pattern.operator === '*' ) {
        //events = queryArc( 
        //  pattern.value,
        //  phase.clone(), //Fraction( 0 ), 
        //  Fraction( speed ).mul( duration )
        //)
        events = processPattern(
          pattern.value,
          duration.mul( speed ),
          phase.clone()//Fraction( speed ).mul( duration )
          //phase.clone() 
        )
          
        // remap events to correct time spans
        .map( evt => {
          evt.arc.start = evt.arc.start.div( speed )//.add( phase )
          evt.arc.end   = evt.arc.end.div( speed )//.add( phase )
          return evt
        })
        //.filter( evt => 
        //  evt.arc.start.compare( incr.mul( i ) ) >= 0 
        //    && evt.arc.start.compare( incr.mul( i+1 ) ) < 0 
        //))
        // add to previous events
        .concat( events )
      }else{
        speed = 1/speed
        //console.log( 'phase:', phase.mul( speed ) )
        events = processPattern( 
          pattern.value, 
          duration.mul( Fraction( speed ) ), 
          phase.mul( speed ),
          getPhaseIncr( pattern ).mul( speed ), null, false
        )
        //console.log( 'events:', log( events, { depth:4 } ) )
        // remap events to correct time spans
        events.map( evt => {
          if( evt.arc.start.valueOf() !== 0 ) {
            // XXX I don't know why this is necessary but it gets rid of a off-by-one error
            evt.arc.start = evt.arc.start.sub( phase.div( 1/speed ) )
          }

          // also, does the event length need to be adjusted? might as well...
          //console.log( 'end:', evt.arc.end.toFraction(), phase.toFraction(), speed )
          evt.arc.end = evt.arc.end.mul( 1/speed )//.mul( 1/speed )
          //evt.arc.end.sub( phase.div( 1/speed ) ).add( 1/speed - 1)

          return evt
        })
        // remove events don't fall in the current window
        .filter( evt => 
          evt.arc.start.compare( incr.mul(i) ) >= 0 && 
          evt.arc.start.compare( incr.mul(i+1) ) <= 0 
        )
        // add to previous events
        .concat( events )
      }
    }*/

    //console.log( 'events:', log( events, { depth:4 }) )
    return state.concat( events )
  },
}

module.exports.queryArc = queryArc
