"use strict";

const https = require('https');

const doRequest = (channel_id, body, callback) => {
  const msg = JSON.stringify(body);
  const opts = {
    host: 'discordapp.com',
    path: '/api/channels/' + channel_id + '/messages',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': 'Bot ' + process.env.DISCORD_TOKEN,
      'content-length': Buffer.byteLength(msg)
    }
  }

  const request = https.request(opts, (req) => {
    let result = '';

    req.on('data', (input) => {
      result += input;
    })

    req.on('end', () => {
      callback(null, {
           status: req.statusCode,
          headers: JSON.parse(JSON.stringify(req.headers) ),
             body: JSON.parse(result),
        remaining: parseInt(req.headers['x-ratelimit-remaining']),
            reset: parseInt(req.headers['x-ratelimit-reset']),
            retry: req.headers['retry-after'] ? parseInt(req.headers['retry-after']) : 0,
      });
    })
  })

  request.write(msg);
  request.end();
}


module.exports = (conf) => {
  const queue = {};
  const get_channel_queue = (channel_id) => {
    return queue[channel_id] || (queue[channel_id] = {
      channe_id: channel_id,
      is_running: false,
      queue: [],
    });
  }

  const has_channel_queue = channel_id => !!queue[channel_id];

  const exec_channel_queue = (channel_id) => {
    if (has_channel_queue(channel_id) ) {
      get_channel_queue(channel_id).is_running = true;
      doRequest(channel_id, get_channel_queue(channel_id).queue[0].body, (err, result) => {
        if (result.status === 200) {
          if (get_channel_queue(channel_id).queue[0].callback) {
            get_channel_queue(channel_id).queue[0].callback(err, result.body);
          }
          get_channel_queue(channel_id).queue.shift();

          if (get_channel_queue(channel_id).queue.length > 0) {
            if (result.remaining > 0) {
              exec_channel_queue(channel_id);
            }
            else {
              setTimeout(() => {
                exec_channel_queue(channel_id);
              }, (result.reset * 1000) - new Date() )
            }
          }
          else {
            get_channel_queue(channel_id).is_running = false;
          }
        }
        else if (result.status === 429) {
          console.log('rate limited');
          setTimeout(() => {
            exec_channel_queue(channel_id);
          }, result.retry);
        }
        else {
          throw JSON.stringify(result, null, 4)
        }
      })
    }
  }

  return (channel_id, body, callback) => {
    get_channel_queue(channel_id).queue.push({
      body: body,
      callback: callback,
    })

    get_channel_queue(channel_id).is_running || exec_channel_queue(channel_id);
  };
};
