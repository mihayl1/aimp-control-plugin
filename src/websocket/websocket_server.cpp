#include "stdafx.h"
#include "websocket/server.h"
#include "plugin/logger.h"

#include <websocketpp.hpp>
#include "endpoint.h"
#include "jsonrpc/frontend.h"
#include "rpc/request_handler.h"

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

class handler : public server::handler, private boost::noncopyable
{
public:

    void on_message(connection_ptr connection, message_ptr msg)
    {
        //con->send(msg->get_payload(), msg->get_opcode());   
        std::string response_content_type,
                    reply_content;
        //Transport::ResponseSender_ptr delayed_response_sender( new DelayedResponseSender(connection, *this) );

        //boost::tribool result = request_handler_.handleRequest(JsonRpc::Frontend::URI,
        //                                                       msg->get_payload(),
        //                                                       delayed_response_sender,
        //                                                       frontend_,
        //                                                       &reply_content,
        //                                                       &response_content_type
        //                                                       );
        //if (result || !result) {
        //fillReplyWithContent(response_content_type, rep);
        
    }

    handler(Rpc::RequestHandler& request_handler)
        :
        request_handler_(request_handler),
        frontend_( *request_handler_.getFrontEnd(JsonRpc::Frontend::URI) )
    {}

private:

    Rpc::RequestHandler& request_handler_;
    Rpc::Frontend& frontend_;
};

struct Server::impl : boost::noncopyable
{
	impl(Rpc::RequestHandler& request_handler)
        :
        server_( server::handler::ptr( new handler(request_handler) ) )
	{

	}

    server server_;
};

Server::Server( const std::string& address,
                const std::string& port,
                Rpc::RequestHandler& request_handler
               )
    :
	impl_( new impl(request_handler) )
{
    server& server = impl_->server_;
    server.alog().unset_level(websocketpp::log::alevel::ALL);
    server.elog().unset_level(websocketpp::log::elevel::ALL);
        
    server.alog().set_level(websocketpp::log::alevel::CONNECT);
    server.alog().set_level(websocketpp::log::alevel::DISCONNECT);
        
    server.elog().set_level(websocketpp::log::elevel::RERROR);
    server.elog().set_level(websocketpp::log::elevel::FATAL);
        
    address;
    const unsigned short port_num = boost::lexical_cast<unsigned short>(port);
    server.listen(port_num, 1); // address is not used since error C2666: 'websocketpp::role::server<endpoint>::listen' : 2 overloads have similar conversions
}

Server::~Server()
{
}

boost::asio::io_service& Server::io_service()
{
    return impl_->server_.io_service();
}

} // namespace Websocket
