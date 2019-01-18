const express = require('express');
const passport = require('passport');
const OAuth2Strategy = require('./passport-oauth2');
const app = express();
const http = require('http');
const httpProxy = require('http-proxy');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const port = 8080;

const proxy = httpProxy.createProxyServer({});

// This proxy redirects API requests and client side requests

// API requests (GET, POST, PUT, ...):
app.all('/api/*', (req, res) => {
    // Remove the API from path
    const new_path = req.url.split('/api')[1];
    req.path = new_path;
    req.url = new_path;
    req.originalUrl = new_path;
    proxy.web(req, res, {
        target: 'http://cms-rr-prod.cern.ch:7003'
    });
});

app.use(cookieParser());
app.use(bodyParser.json());
app.use(session({ secret: 'anything' }));
app.use(passport.initialize());
app.use(passport.session()); // Used to persist login sessions

passport.use(
    new OAuth2Strategy(
        {
            authorizationURL: 'https://oauth.web.cern.ch/OAuth/Authorize',
            tokenURL: 'https://oauth.web.cern.ch/OAuth/Token',
            clientID: 'cms-runregistry',
            clientSecret: 'h00FZSTyBjlalYKp7GqdBZQP2heMeaqLnpSNiTNXvcc1',
            callbackURL: 'https://cmsrunregistry.web.cern.ch/callback'
        },
        function(accessToken, refreshToken, profile, done) {
            done(null, profile);
        }
    )
);

// Used to stuff a piece of information into a cookie
passport.serializeUser(function(user, done) {
    done(null, user);
});

passport.deserializeUser(function(user, done) {
    done(null, user);
});

// Middleware to check if the user is authenticated
function isUserAuthenticated(req, res, next) {
    if (req.user) {
        next();
    } else {
        res.redirect('/callback');
    }
}

app.get(
    '/callback',
    passport.authenticate('oauth2', {
        failureRedirect: '/error'
    }),
    function(req, res) {
        console.log(req.user.displayName);
        res.redirect('/');
    }
);

// Logout route
app.get('/logout', (req, res) => {
    req.logout();
    res.redirect('/');
});
app.get('/error', (req, res) => {
    res.send('Error authenticating user');
});

// Client requests
app.all('*', isUserAuthenticated, (req, res) => {
    proxy.on('proxyReq', (proxyReq, req, res, options) => {
        const { user } = req;
        if (user) {
            proxyReq.setHeader('displayName', user.displayName);
            proxyReq.setHeader('egroups', user.egroups);
            proxyReq.setHeader('email', user.email);
            proxyReq.setHeader('id', user.id);
        }
    });
    proxy.web(req, res, {
        target: 'http://cms-rr-prod.cern.ch:7001'
    });
});

// If something goes wrong on either API or client:
proxy.on('error', function(err, req, res) {
    res.writeHead(500, {
        'Content-Type': 'text/plain'
    });

    res.end(`${err.message} ----------- ${JSON.stringify(err)}`);
});

app.listen(port, () => console.log('OAUTH Proxy started'));
