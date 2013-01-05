var TKT = {}; // Our namespace.


$(document).ready(function () {
  // ><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><
  // Initialization
  //
  // We create the player elements, and bind actions to events.


  // Create player nodes.
  TKT.make_player();

  // Init connection maps and bind click events for connections.
  TKT.init_connections();
  TKT.bind_connection_events();

  // Init canvas and bind click events for drawing.
  TKT.canvas = document.getElementById('canvas');
  TKT.ctx = TKT.canvas.getContext('2d');
  TKT.bind_draw_events();

  // We store pitch dimensions so we can test if players are placed on
  // the pitch (and display them less eye-catching otherwise).
  var save_pitch_dimensions = function () {
    TKT.pitch_x = $(TKT.canvas).offset().left;
    TKT.pitch_y = $(TKT.canvas).offset().top;
    TKT.pitch_w = $(TKT.canvas).width();
    TKT.pitch_h = $(TKT.canvas).height();
  };
  save_pitch_dimensions();

  // Recalculate various positions when the window is resized.
  window.onresize = function () {
    save_pitch_dimensions();
    $('.tkt-player-node').each(function () {
      TKT.set_player_position($(this));
    });
    TKT.set_connection_positions();
    TKT.set_marker_positions();
  };

  // Bind player color change events.
  $('#home-first-color, #home-second-color, #away-first-color, #away-second-color')
    .focusout(function () { TKT.apply_team_colors(); });

  // Bind timeline interaction events.
  $('.tkt-action-reset').click(TKT.reset);
  $('.tkt-action-remove').click(TKT.remove);
  $('.tkt-regular-first-half, .tkt-regular-second-half').click(function (e) {
    TKT.save_state(e.pageX);
  });
  
  // Manage left mouse status
  TKT.left_mouse_down = false;
  $('.tkt-canvas').mousedown(function (e) {
    e.preventDefault();
    TKT.left_mouse_down = (e.which === 1);
  });
  $(document).mouseup(function () {
    TKT.left_mouse_down = false;
  });

  TKT.restore();
});

// Simply sync all input fields for team colors at once.
TKT.apply_team_colors = function () {
  $('.tkt-player-home .tkt-player').css('background-color', $('#home-first-color').val());
  $('.tkt-player-home .tkt-player').css('border-color', $('#home-second-color').val());
  $('.tkt-player-away .tkt-player').css('background-color', $('#away-first-color').val());
  $('.tkt-player-away .tkt-player').css('border-color', $('#away-second-color').val());
};

// Reset player positions, remove connections.
TKT.reset = function () {
  TKT.init_connections();
  TKT.position_player();
};


TKT.remove = function () {
  if ('localStorage' in window && window.localStorage !== null) {
    window.localStorage.clear();
  }
  $('.tkt-marker').remove();
  TKT.marker = {};
  TKT.storage = {};
  TKT.save_id = 0;
};

// ><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><
// Player initialization
//
// Players are absolute positioned <div> elements, that can be dragged
// (using the jQuery UI draggable feature) along the pitch container.


// Create all 22 player nodes.
TKT.make_player = function () {
  for (var i = 1; i <= 11; i++) {
    var html = ['<div class="tkt-player-node" data-number="', i, '">',
                '<div class="tkt-player">',
                '</div>',
                '<div class="tkt-player-name"><input size="5" /></div>',
                '</div>'];

    var home = $(html.join('')).addClass('tkt-player-home').attr('data-id', 'home-' + i);
    var away = $(html.join('')).addClass('tkt-player-away').attr('data-id', 'away-' + i);
    $('body').prepend([home, away]);
  }

  // We want the input field for the name to lose focus when the
  // player isn't hovered anymore, so we simply set the focus to the
  // clear button.
  $('.tkt-player-node').hover(
    function () { return 0; },
    function () { $('.tkt-color-clear').focus(); return 0; }
  );

  TKT.position_player();
  TKT.apply_team_colors();
};

// Set players to their inital positions.
TKT.position_player = function () {
  // Home team.
  var off = $('.tkt-home').offset();
  $('.tkt-player-home').each(function () {
    var i = parseInt($(this).attr('data-number'), 10);
    $(this).css({left: (i % 2) * 90 + off.left + 30, top: i * 50 + off.top - 10});
  });

  // Away team.
  off = $('.tkt-away').offset();
  $('.tkt-player-away').each(function () {
    var i = parseInt($(this).attr('data-number'), 10);
    $(this).css({left: ((i - 1) % 2) * 90 + off.left + 30, top: i * 50 + off.top - 10});
  });

  // Both teams.
  $('.tkt-player-node').each(function () {
    TKT.save_player_position($(this));
    TKT.is_on_pitch($(this));
  });
};


// Players are positioned with absolute values because they "float"
// around the page, but we store their relative positions so that we
// can adjust them on the resize event.

TKT.save_player_position = function (p) {
  var off = $('.tkt-container').offset();
  var pos = p.position();
  p.attr('data-left', pos.left - off.left);
  p.attr('data-top', pos.top - off.top);
};

TKT.set_player_position = function (p) {
  var off = $('.tkt-container').offset();
  p.css({'left': off.left + parseInt(p.attr('data-left'), 10),
         'top': off.top + parseInt(p.attr('data-top'), 10)});
  TKT.is_on_pitch(p);
};


// ><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><
// Draw Events
//
// We have a canvas layer above the pitch, where we can draw when the
// mouse is moved with the left button down.


// We store all drawn pixels in this map, so that we do not need to
// save the whole canvas for saved states. When loading, we simply
// redraw these pixels.
TKT.pixel = {};

TKT.bind_draw_events = function () {
  var colors = {'black': [0, 0, 0],
                'red': [255, 0, 0],
                'blue': [0, 0, 255],
                'yellow': [255, 255, 0],
                'erase': 'erase'};
  
  $('.tkt-canvas').mousemove(function (e) {
    if (TKT.left_mouse_down) {
      var px = e.pageX - $(this).offset().left;
      var py = e.pageY - $(this).offset().top;
      var color = colors[$('.tkt-color-select input:checked').attr('data-color')];

      for (var i = -1; i <= 1; i++) {
        for (var j = -1; j <= 1; j++) {
          TKT.draw_point(px + i, py + j, color);
        }
      }
    }
  });

  $('.tkt-color-clear').click(TKT.clear);
};

// Erase all drawings.
TKT.clear = function () {
  TKT.ctx.save();
  TKT.ctx.clearRect(0, 0, 800, 600);
  TKT.ctx.restore();
  TKT.pixel = {};
};

// Draw (or delete) a point and "log" the event in the pixel map (or
// delete an existing entry).
TKT.draw_point = function (x, y, color) {
  TKT.ctx.save();
  var image_data = TKT.ctx.createImageData(1, 1);
  if (color !== 'erase') {
    image_data.data[0] = color[0];
    image_data.data[1] = color[1];
    image_data.data[2] = color[2];
  }
  image_data.data[3] = (color === 'erase') ? 0 : 255;
  TKT.ctx.putImageData(image_data, x, y);
  TKT.ctx.restore();

  if (color === 'erase') {
    delete TKT.pixel[x + '-' + y];
  } else {
    TKT.pixel[x + '-' + y] = color;
  }
};


// ><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><
// Connections
//
// Players can be connected with lines. The lines are absolute
// positioned <div> elements that have to be scaled and rotated
// (shaped) to represent a line. Whenever a player is moved, all
// adjacent connections must be reshaped. Removing lines is simple
// then however, and we can use the :hover selector to bind the
// action.


// Remove all current connections and initialize empty maps.
TKT.init_connections = function () {
  $('.connection').remove();
  TKT.connections = {};
  $('.tkt-player-node').each(function () {
    TKT.connections[$(this).attr('data-id')] = {};
  });
};

// Connect players on right-click, move adjacent connections when
// players are moved.
TKT.bind_connection_events = function () {
  var connect, line;
  
  $('.tkt-player-node').off('contextmenu').bind('contextmenu', function (e) {
    e.preventDefault();

    if (!connect) {
      // First click, create a line and let it follow the mouse.
      connect = $(this);
      line = TKT.make_line();
      $('.tkt-container').mousemove(function (e) {
        var from = TKT.center_of_player(connect);
        TKT.shape_line(line, from.x, from.y, e.pageX, e.pageY);
      });
    } else {
      // Second click, connect the line.
      $('.tkt-container').unbind('mousemove');
      TKT.connect_player(connect, $(this), line);
      connect = false;
    }
    return 0;
  });

  $('.tkt-player-node').draggable({
    containment: '.tkt-container',
    drag: function () {
      TKT.is_on_pitch($(this));
      TKT.save_player_position($(this));
      var lines = TKT.connections[$(this).attr('data-id')];
      for (var k in lines) {
        var item = lines[k];
        var from = TKT.center_of_player(item.from);
        var to = TKT.center_of_player(item.to);
        TKT.shape_line(item.line, from.x, from.y, to.x, to.y);
      }
    }
  });
};

// Connect player 'f' with 't' throught the 'line'.
TKT.connect_player = function (f, t, line) {
  var from = TKT.center_of_player(f);
  var to = TKT.center_of_player(t);
  var fid = f.attr('data-id'), tid = t.attr('data-id');
  
  if (fid !== tid && TKT.connections[fid][tid] === undefined) {
    // Only connect if it's not a loop and there is no connection yet.
    TKT.connections[fid][tid] = {line: line, from: f, to: t};
    TKT.connections[tid][fid] = {line: line, from: t, to: f};
    TKT.shape_line(line, from.x, from.y, to.x, to.y);
    line.click(function () {
      delete TKT.connections[fid][tid];
      delete TKT.connections[tid][fid];
      $(this).remove();
    });
  } else {
    line.remove(); // Otherwise just remove the line.
  }
};

// Position all connections.
TKT.set_connection_positions = function () {
  for (var p in TKT.connections) {
    for (var l in TKT.connections[p]) {
      var item = TKT.connections[p][l];
      var from = TKT.center_of_player(item.from);
      var to = TKT.center_of_player(item.to);
      TKT.shape_line(item.line, from.x, from.y, to.x, to.y);
    }
  }
};

// Return the absolute position of the center of player 'p'.
TKT.center_of_player = function (p) {
  var ic = p.children('.tkt-player');
  var fx = ic.offset().left + (ic.width() / 2);
  var fy = ic.offset().top + (ic.height() / 2);
  return {x: fx, y: fy};
};

// Create a new line element.
TKT.make_line = function () {
  var line = $('<div class="connection"></div>');
  $('body').prepend(line);
  // For some reason the CSS rules do not apply when placed in the .css file.
  line.css({'position': 'absolute',
            'width': 2,
            'background-color': '#333333',
            'opacity': 0.25,
            'z-index': 20,
            'transform-origin': 'top left',
            '-webkit-transform-origin': 'top left',
            '-moz-transform-origin': 'top left',
            '-o-transform-origin': 'top left',
            '-ms-transform-origin': 'top left'});
  line.hover(function () { $(this).css('opacity', 0.1); },
             function () { $(this).css('opacity', 0.25); });
  
  return line;
};

// Calculate line size and orientation.
TKT.shape_line = function (line, fx, fy, tx, ty) {
  var line_length = Math.sqrt((tx - fx) * (tx - fx) + (ty - fy) * (ty - fy));
  line.css({left: fx, top: fy, height: line_length});
  var angle = (fx - tx > 0 ? 1 : -1) * (180 / Math.PI) * Math.acos((ty - fy) / line_length);
  TKT.rotate(line, angle);
};


// ><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><
// Timeline interaction
//
// When the timeline is clicked, we save the current state and add a
// marker add that position. When a marker is clicked, we load the
// corresponing saved state.


TKT.marker = {};
TKT.storage = {};
TKT.save_id = 0;


// If the browser has support for localStorage, we store all saved
// states there.
TKT.store = function () {
  if ('localStorage' in window && window.localStorage !== null) {
    window.localStorage.data = JSON.stringify(TKT.storage);
    window.localStorage.marker = JSON.stringify(TKT.marker);
    window.localStorage.id = JSON.stringify(TKT.save_id);
  }
};

// We restore all saved states from localStorage when the site is
// loaded.
TKT.restore = function () {
  if ('localStorage' in window && window.localStorage !== null) {
    if (window.localStorage.data) {
      TKT.storage = JSON.parse(window.localStorage.data);
      TKT.marker = JSON.parse(window.localStorage.marker);
      for (var k in TKT.marker) {
        TKT.add_marker(k, TKT.marker[k]);
      }
      TKT.save_id = JSON.parse(window.localStorage.id);
    }
  }
};


// Save the current state with a marker at position 'x'.
TKT.save_state = function (x) {
  var closure = TKT.save_id;
  TKT.save_id += 1;
  
  TKT.add_marker(closure, x);

  // Save player positions.
  var ply = {};
  $('.tkt-player-node').each(function () {
    ply[$(this).attr('data-id')] = {
      'left': $(this).attr('data-left'),
      'top': $(this).attr('data-top'),
      'name': $(this).find('input').val()
    };
  });

  // Save connections.
  var con = [];
  for (var f in TKT.connections) {
    for (var t in TKT.connections[f]) {
      con.push({'fid': f, 'tid': t});
    }
  }

  // Save drawings.
  var pix = $.extend({}, TKT.pixel);

  // Save team colors.
  var col = {};
  col['home-fst'] = $('#home-first-color').val();
  col['home-snd'] = $('#home-second-color').val();
  col['away-fst'] = $('#away-first-color').val();
  col['away-snd'] = $('#away-second-color').val();


  TKT.storage[closure] = {
    'players': ply,
    'connections': con,
    'pixel': pix,
    'colors': col
  };
  TKT.store();
};

// Add a marker to load the state 'id' at timeline position 'x'.
TKT.add_marker = function (id, x) {
  TKT.marker[id] = x;

  var off = $('.tkt-timeline').offset();
  var rel_x = x - off.left;
  var html = ['<div class="tkt-marker"',
              'data-rel-x="', rel_x, '"',
              'data-key="', id, '">',
              'X</div>'];

  var marker = $(html.join(''));
  $('body').append(marker);
  marker.click(function () { TKT.load_state(id); });

  marker.css({'left': x, 'top': off.top + 7});
  marker.bind('contextmenu', function (e) {
    e.preventDefault();
    delete TKT.marker[id];
    delete TKT.storage[id];
    $(this).remove();
    TKT.store();
  });
};

TKT.set_marker_positions = function () {
  var off = $('.tkt-timeline').offset();
  $('.marker').each(function () {
    $(this).css({'left': off.left + parseInt($(this).attr('data-rel-x'), 10),
                 'top': off.top + 7});
  });
};

// Load save state 'key'.
TKT.load_state = function (key) {
  var data = TKT.storage[key];

  // Load player positions.
  for (var k in data.players) {
    var p = data.players[k];
    var node = $('.tkt-player-node[data-id="' + k + '"]');
    node.attr('data-left', p.left).attr('data-top', p.top);
    node.find('input').val(p.name);
    TKT.set_player_position(node);
  }

  // Load connections.
  TKT.init_connections();
  for (var i = 0; i < data.connections.length; i++) {
    var item = data.connections[i];
    var f = $('.tkt-player-node[data-id="' + item.fid + '"]');
    var t = $('.tkt-player-node[data-id="' + item.tid + '"]');
    TKT.connect_player(f, t, TKT.make_line());
  }
  TKT.set_connection_positions();

  // Load drawings.
  TKT.clear();
  for (var k in data.pixel) {
    var xy = k.split('-');
    var x = parseInt(xy[0], 10), y = parseInt(xy[1], 10);
    TKT.draw_point(x, y, data.pixel[k]);
  }

  // Load team colors.
  $('#home-first-color').val(data.colors['home-fst']);
  $('#home-second-color').val(data.colors['home-snd']);
  $('#away-first-color').val(data.colors['away-fst']);
  $('#away-second-color').val(data.colors['away-snd']);
  TKT.apply_team_colors();
};


// ><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><
// Helper

TKT.is_on_pitch = function (p) {
  var pos = p.position();
  if (pos.left > TKT.pitch_x && pos.left < TKT.pitch_x + TKT.pitch_w) {
    if (pos.top > TKT.pitch_y && pos.top < TKT.pitch_y + TKT.pitch_h) {
      p.removeClass('tkt-outside-pitch');
    }
  } else {
    p.addClass('tkt-outside-pitch');
  }
};

TKT.rotate = function (node, deg) {
  node.css({'transform'        : 'rotate(' + deg + 'deg)',
            '-webkit-transform': 'rotate(' + deg + 'deg)',
            '-moz-transform'   : 'rotate(' + deg + 'deg)',
            '-o-transform'     : 'rotate(' + deg + 'deg)',
            '-ms-transform'    : 'rotate(' + deg + 'deg)'});
};
