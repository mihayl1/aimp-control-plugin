#include "stdafx.h"
#include "websocket/server.h"
#include "plugin/logger.h"

namespace {
using namespace ControlPlugin::PluginLogger;
ModuleLoggerType& logger()
    { return getLogManager().getModuleLogger<Websocket::Server>(); }
}

namespace Websocket
{

using ControlPlugin::PluginLogger::LogManager;

Server::Server( boost::asio::io_service& /*io_service*/,
                const std::string& /*address*/,
                const std::string& /*port*/,
                RequestHandler& request_handler
              )
    :
    request_handler_(request_handler)
{
    
}

Server::~Server()
{
}

} // namespace Websocket
