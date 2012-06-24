#include "stdafx.h"
#include "websocket/server.h"
#include "plugin/logger.h"

#include <websocketpp.hpp>
#include "endpoint.h"

namespace {
using namespace ControlPlugin::PluginLogger;
ModuleLoggerType& logger()
    { return getLogManager().getModuleLogger<Websocket::Server>(); }
}

namespace Websocket
{

using ControlPlugin::PluginLogger::LogManager;

typedef aimp_endpoint<websocketpp::role::server,
                                   websocketpp::socket::plain> server;

class echo_server_handler : public server::handler {
public:
    void on_message(connection_ptr con, message_ptr msg) {
        con->send(msg->get_payload(), msg->get_opcode());
    }
};

struct Server::impl : boost::noncopyable
{
	impl(Rpc::RequestHandler& request_handler
		 )
        :
        request_handler_(request_handler),
        server_( server::handler::ptr( new echo_server_handler() ) )
	{

	}

    Rpc::RequestHandler& request_handler_;
    server server_;
};

Server::Server( const std::string& address,
                const std::string& port,
                Rpc::RequestHandler& request_handler
               )
    :
	impl_( new impl(request_handler) )
{
    address;
    port;
}

Server::~Server()
{
}

} // namespace Websocket
