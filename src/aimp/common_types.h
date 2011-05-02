// Copyright (c) 2011, Alexey Ivanov

#ifndef AIMP_COMMON_TYPES_H
#define AIMP_COMMON_TYPES_H

#include <vector>
#include <map>
#include <boost/shared_ptr.hpp>

namespace AIMPPlayer
{

typedef int PlaylistEntryID; //! playlist entry handle.
typedef int HPLS; //! playlist handle
typedef HPLS PlaylistID; //! playlist handle

class PlaylistEntry;

//! list of entries. Map entry ID to PlaylistEntry oblect.
typedef std::map<PlaylistEntryID, boost::shared_ptr<PlaylistEntry> > EntriesListType;

//! Map of internal Aimp entry index to plugin PlaylistEntry ID. Used to easy determine of change in playlists.
typedef std::vector<PlaylistEntryID> EntryIdListInAimpOrder;

//! list of entry IDs.
typedef std::vector<PlaylistEntryID> PlaylistEntryIDList;

//! direction of sorting.
enum ORDER_DIRECTION { ASCENDING = 0, DESCENDING };

//! Entry fields IDs available for sorting
enum ENTRY_FIELDS_ORDERABLE { TITLE = 0, ARTIST, ALBUM, DATE, GENRE, BITRATE, DURATION, FILESIZE, RATING, FIELDS_ORDERABLE_SIZE };

} // namespace AIMPPlayer

#endif // #ifndef AIMP_COMMON_TYPES_H