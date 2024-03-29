// Copyright (c) 2014, Alexey Ivanov

#pragma once

#pragma warning (push, 3)
#include <boost/log/common.hpp>
#include <boost/log/sinks/sync_frontend.hpp>
#include <boost/log/sinks/text_file_backend.hpp>
#include <boost/log/sinks/debug_output_backend.hpp>
#include <boost/log/sources/severity_channel_logger.hpp>
#pragma warning (pop)

#include <boost/static_assert.hpp>
#include <set>

namespace ControlPlugin {

//! contains logger utils.
namespace PluginLogger {

//! Identificators of log message's severity level. If you need to add levels update ControlPlugin::PluginSettings severityToString/severityFromString functions.
enum SEVERITY_LEVELS { debug = 0,
                       info,
                       warning,
                       error,
                       critical,
                       severity_levels_count
};

namespace log = boost::log;
namespace sinks = boost::log::sinks;
namespace keywords = boost::log::keywords;
namespace fs = boost::filesystem;

/*! logger source type for using by entire application.
    Add severity and module(or channel in terms of Boost.Log) name attributes.
*/
typedef log::sources::severity_channel_logger<SEVERITY_LEVELS> ModuleLoggerType;

/*!
    \brief Provides log output functionality for entire application.
           Current implementation uses Boost.Log library, so macroses BOOST_LOG_SEV(logger(), severity) are used for log msg writing.
           Each module should use his own getModuleLogger() function specialization to logger access.<br>
           Function logger() is implemented by following example code in each module:
           <PRE>
               // for ControlPlugin::AIMPControlPlugin module
               namespace {
                    using namespace ControlPlugin::PluginLogger;
                    ModuleLoggerType& logger()
                        { return getLogManager().getModuleLogger<ControlPlugin::AIMPControlPlugin>(); }
               }
           </PRE>
*/
class LogManager
{
public:
    static const std::string kRPC_SERVER_MODULE_NAME;
    static const std::string kHTTP_SERVER_MODULE_NAME;
    static const std::string kAIMP_MANAGER_MODULE_NAME;
    static const std::string kPLUGIN_MODULE_NAME;

    LogManager();
    ~LogManager();

    /*! Returns module logger.
        For each module should exist ModuleLoggerType object and specialization which returns reference to it must be provided.
    */
    template<class T>
    ModuleLoggerType& getModuleLogger();

    //! starts log.
    void startLog(const fs::wpath& log_directory,
                  const std::set<std::string>& modules_to_lo); // throws FileLogError

    //! stops log.
    void stopLog();

    /*! set minimal severity level of log messages.
        Messages with lower severity will not be written.
    */
    void setSeverity(int severity);

    //! Returns current minimal severity level of log messages.
    SEVERITY_LEVELS getSeverity() const;

private:

    /*!
        \brief Ensures we have full access to log directory.
               Used to found possible filesystem errors before using boost::log::sinks::text_file_backend,
               since I do not know how to handle it's exceptions correctly.
        \throw FileLogError if log directory is not fully accessible.
    */
    void checkDirectoryAccess(const fs::wpath& log_directory) const; // throws FileLogError

    /*!
        \brief Used for filter log messages of concrete modules.
               List of modules where log is enabled passed in startLog() method.
               Function tries to find specified module name string in that list.
        \return true if log is enabled for specified module, false otherwise.
    */
    bool logInModuleEnabled(const std::string& module_name) const;

    //!< Messages with lower severity will not be written.
    SEVERITY_LEVELS severity_;

    /*! Loggers for all modules of plugin.
         Each module must have unique string name and getModuleLogger() method specialization to pass it to clients.
    */
    ModuleLoggerType plugin_lg_,
                     aimp_manager_lg_,
                     rpc_server_lg_,
                     http_server_lg_;

    typedef sinks::synchronous_sink< sinks::text_file_backend > sink_file_t;
    boost::shared_ptr< sink_file_t > sink_file_; //!< sink for file output.

    typedef sinks::synchronous_sink< sinks::debug_output_backend > debug_sink;
    boost::shared_ptr< debug_sink > sink_dbg_; //!< sink for debugger output.

    /*! List of module names where log is enabled.
         Initialized in startLog() method. Used in moduleFilter() method.
    */
    std::set<std::string> modules_to_log_;
};

//! provide global access to LogManager object.
LogManager& getLogManager();

} } // namespace ControlPlugin::PluginLogger

/* Forward declarations for LogManager::getModuleLogger() specialization. */
namespace ControlPlugin { class AIMPControlPlugin; }
namespace AIMPPlayer { class AIMPManager; }
namespace Rpc { class RequestHandler; }
namespace Http { class Server; }

namespace ControlPlugin { namespace PluginLogger {
template<class T>
ModuleLoggerType& LogManager::getModuleLogger()
{
    BOOST_STATIC_ASSERT(!"Use template specialization of getModuleLogger() for concrete module.");
}

template<>
ModuleLoggerType& LogManager::getModuleLogger<ControlPlugin::AIMPControlPlugin>();

template<>
ModuleLoggerType& LogManager::getModuleLogger<AIMPPlayer::AIMPManager>();

template<>
ModuleLoggerType& LogManager::getModuleLogger<Rpc::RequestHandler>();

template<>
ModuleLoggerType& LogManager::getModuleLogger<Http::Server>();

/*!
    \brief Base class for exceptions generated by LogManager methods.
    Used to be able to catch any LogManagerException exception like this:
        try { ..error code.. } catch (LogManagerException&) { ..handle.. }
*/
class LogManagerException : public std::exception
{
public:
    explicit LogManagerException(const std::string& what_arg)
        :
        exception( what_arg.c_str() )
    {}
};

//! File output error.
class FileLogError : public LogManagerException
{
public:
    explicit FileLogError(const std::string& what_arg)
        :
        LogManagerException( what_arg.c_str() )
    {}
};

} } // namespace ControlPlugin::PluginLogger
