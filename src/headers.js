// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { h, render, Component } from 'preact';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// Tell Babel to transform JSX into h() calls:
/** @jsx h */

const tabId = parseInt(window.location.search.substring(1));

function log(...args) {
  chrome.extension.getBackgroundPage().console.log(...args);
}

class RequestList extends Component {
  state = { requests: {} };

  componentDidMount() {
    try {
      chrome.debugger.sendCommand({ tabId }, 'Network.enable');
      chrome.debugger.onEvent.addListener(this.onEvent);
    } catch (error) {
      log(error);
    }
  }

  componentWillUnmount() {
    chrome.debugger.detach({ tabId });
  }

  onEvent = (debuggeeId, message, params) => {
    try {
      log({ debuggeeId, message, params });

      const { request, requestId } = params;
      if (message === 'Network.requestWillBeSent') {
        this.updateRequest(requestId, {
          request: this.toCurlBash(request),
          url: request.url,
        });
      } else if (message === 'Network.responseReceived') {
        chrome.debugger.sendCommand(
          {
            tabId: debuggeeId.tabId,
          },
          'Network.getResponseBody',
          {
            requestId: params.requestId,
          },
          (response) => {
            const { mimeType, status } = params.response;
            this.updateRequest(requestId, {
              mimeType,
              status,
            });
            if (response) {
              this.updateRequest(requestId, {
                response: response.body,
              });
            } else {
              log({ debuggeeId, message, params, response });
            }
          }
        );
      } else if (message === 'Network.loadingFinished') {
        chrome.debugger.sendCommand(
          {
            tabId: debuggeeId.tabId,
          },
          'Network.getResponseBody',
          {
            requestId: params.requestId,
          },
          (response) => {
            if (response) {
              this.updateRequest(requestId, {
                response: response.body,
              });
            } else {
              log({ debuggeeId, message, params, response });
            }
          }
        );
      } else if (message === 'Network.loadingFailed') {
        this.updateRequest(requestId, {
          status: 'fail',
          response: params.errorText,
        });
      } else {
        // log({ debuggeeId, message, params });
      }
    } catch (error) {
      log(error);
    }
  };

  toCurlBash = (request) => {
    try {
      const { headers, postData, method } = request;
      const headersString = Object.keys(headers)
        .map((header) => ` -H '${header}: ${headers[header]}'`)
        .join('');
      const dataBinary = !postData ? '' : ` --data-binary '${postData}'`;
      const methodOpt = ` -X ${method}`;
      return `curl '${
        request.url
      }'${methodOpt}${headersString}${dataBinary} --compressed`;
    } catch (error) {
      log(error);
    }
  };

  updateRequest = (requestId, requestObj) => {
    try {
      const { requests } = { ...this.state };
      requests[requestId] = { ...requests[requestId], ...requestObj };
      this.setState({ requests });
    } catch (error) {
      log(error);
    }
  };

  saveAsZip = (requestId) => {
    try {
      const { requests } = { ...this.state };
      const { request, response, status, mimeType } = requests[requestId];
      const resOut = response == null ? status : response;
      const responseFileName =
        mimeType === 'application/json' ? 'response.json' : 'response.txt';

      const zip = new JSZip();
      zip.file('request.txt', request);
      zip.file(responseFileName, resOut);
      zip.generateAsync({ type: 'blob' }).then((content) => {
        saveAs(content);
      });
    } catch (error) {
      log(error);
    }
  };

  render() {
    const { requests } = this.state;
    return (
      <div>
        {Object.keys(requests).map((request) => {
          const { status, url } = requests[request];
          return (
            <div key={request}>
              <button
                type="button"
                onClick={() => {
                  this.saveAsZip(request);
                }}
                style={{ marginRight: 10 }}
              >
                Save
              </button>
              <span>{`${status} - ${url}`}</span>
            </div>
          );
        })}
      </div>
    );
  }
}

render(<RequestList />, document.getElementById('container'));
