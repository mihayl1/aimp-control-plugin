#ifndef WEBSOCKET_SERVER_H
#define WEBSOCKET_SERVER_H

namespace Websocket
{

class RequestHandler;

class Server : private boost::noncopyable
{
public:
    /*
        Construct the server to listen on the specified TCP address and port.
    */
    Server(boost::asio::io_service& io_service,
           const std::string& address,
           const std::string& port,
           RequestHandler& request_handler
           ); // throws std::runtime_error.

    ~Server();

private:

    RequestHandler& request_handler_;
};

} // namespace Websocket

#endif // #ifndef WEBSOCKET_SERVER_H
