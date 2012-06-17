#pragma once

#include <string>
#include <boost/shared_ptr.hpp>

namespace Transport {

class ResponseSender
{
public:
    virtual void send(const std::string& response, const std::string& response_content_type) = 0;
};

typedef boost::shared_ptr<ResponseSender> ResponseSender_ptr;

} // namespace Transport
