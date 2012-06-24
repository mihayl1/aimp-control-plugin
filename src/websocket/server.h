#ifndef WEBSOCKET_SERVER_H
#define WEBSOCKET_SERVER_H

#include <boost/asio.hpp>

namespace Rpc {
class RequestHandler;
}

namespace Websocket
{

class Server : private boost::noncopyable
{
public:
    /*
        Construct the server to listen on the specified TCP address and port.
    */
    Server(const std::string& address,
           const std::string& port,
           Rpc::RequestHandler& request_handler
           ); // throws std::runtime_error.

    ~Server();

    boost::asio::io_service& io_service();

private:

	struct impl;
	std::unique_ptr<impl> impl_;
};

} // namespace Websocket

#endif // #ifndef WEBSOCKET_SERVER_H
