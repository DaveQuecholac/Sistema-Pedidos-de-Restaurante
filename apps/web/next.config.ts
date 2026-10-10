import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['restaurante.localhost'],
  async redirects() {
    return [
      { source: '/orders', destination: '/ordenes', permanent: false },
      { source: '/orders/:orderId', destination: '/ordenes/:orderId', permanent: false },
      {
        source: '/orders/:orderId/totals',
        destination: '/pago/:orderId/cuenta',
        permanent: false,
      },
      {
        source: '/orders/:orderId/payment',
        destination: '/pago/:orderId/cobro',
        permanent: false,
      },
      {
        source: '/ordenes/:orderId/cuenta',
        destination: '/pago/:orderId/cuenta',
        permanent: false,
      },
      {
        source: '/ordenes/:orderId/cobro',
        destination: '/pago/:orderId/cobro',
        permanent: false,
      },
      { source: '/payment', destination: '/pago', permanent: false },
      { source: '/kitchen', destination: '/cocina', permanent: false },
    ];
  },
};

export default nextConfig;
