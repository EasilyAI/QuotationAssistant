module.exports = {
  // CRACO configuration to customize Create React App
  // The main fix for 431 errors is handled via NODE_OPTIONS in package.json
  // This file allows us to customize webpack without ejecting
  webpack: {
    configure: (webpackConfig) => {
      return webpackConfig;
    },
  },
};

