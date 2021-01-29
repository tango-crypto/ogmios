--  This Source Code Form is subject to the terms of the Mozilla Public
--  License, v. 2.0. If a copy of the MPL was not distributed with this
--  file, You can obtain one at http://mozilla.org/MPL/2.0/.

{-# LANGUAGE DuplicateRecordFields #-}
{-# LANGUAGE TypeApplications #-}

-- NOTE:
-- This module uses partial record field accessor to automatically derive
-- JSON instances from the generic data-type structure. The partial fields are
-- otherwise unused.
{-# OPTIONS_GHC -fno-warn-partial-fields #-}

module Ogmios.Data.Protocol.StateQuery
    ( -- * Codecs
      StateQueryCodecs (..)
    , mkStateQueryCodecs

      -- * Messages
    , StateQueryMessage (..)

      -- ** Acquire
    , Acquire (..)
    , _decodeAcquire
    , AcquireResponse (..)
    , _encodeAcquireResponse

      -- ** Release
    , Release (..)
    , _decodeRelease
    , ReleaseResponse (..)
    , _encodeReleaseResponse

      -- ** Query
    , Query (..)
    , _decodeQuery
    , QueryResponse (..)
    , _encodeQueryResponse
    ) where

import Ogmios.Data.Json.Prelude

import Ogmios.Data.Json
    ( SomeQuery (..) )
import Ogmios.Data.Protocol
    ()

import Ouroboros.Network.Block
    ( Point (..) )
import Ouroboros.Network.Protocol.LocalStateQuery.Type
    ( AcquireFailure )

import qualified Codec.Json.Wsp as Wsp
import qualified Data.Aeson.Types as Json
import qualified Text.Show as T

--
-- Codecs
--

data StateQueryCodecs block = StateQueryCodecs
    { decodeAcquire
        :: ByteString
        -> Maybe (Wsp.Request (Acquire block))
    , encodeAcquireResponse
        :: Wsp.Response (AcquireResponse block)
        -> Json
    , decodeRelease
        :: ByteString
        -> Maybe (Wsp.Request Release)
    , encodeReleaseResponse
        :: Wsp.Response ReleaseResponse
        -> Json
    , decodeQuery
        :: ByteString
        -> Maybe (Wsp.Request (Query block))
    , encodeQueryResponse
        :: Wsp.Response (QueryResponse block)
        -> Json
    }

mkStateQueryCodecs
    :: (FromJSON (SomeQuery Maybe block), FromJSON (Point block))
    => (Point block -> Json)
    -> (AcquireFailure -> Json)
    -> StateQueryCodecs block
mkStateQueryCodecs encodePoint encodeAcquireFailure =
    StateQueryCodecs
        { decodeAcquire =
            decodeWith _decodeAcquire
        , encodeAcquireResponse =
            _encodeAcquireResponse encodePoint encodeAcquireFailure
        , decodeRelease =
            decodeWith _decodeRelease
        , encodeReleaseResponse =
            _encodeReleaseResponse
        , decodeQuery =
            decodeWith _decodeQuery
        , encodeQueryResponse =
            _encodeQueryResponse
        }

--
-- Messages
--

data StateQueryMessage block
    = MsgAcquire
        (Acquire block)
        (Wsp.ToResponse (AcquireResponse block))
    | MsgRelease
        Release
        (Wsp.ToResponse ReleaseResponse)
    | MsgQuery
        (Query block)
        (Wsp.ToResponse (QueryResponse block))

--
-- Acquire
--

data Acquire block
    = Acquire { point :: Point block }
    deriving (Generic, Show)

_decodeAcquire
    :: FromJSON (Point block)
    => Json
    -> Json.Parser (Wsp.Request (Acquire block))
_decodeAcquire =
    Wsp.genericFromJSON Wsp.defaultOptions

data AcquireResponse block
    = AcquireSuccess { point :: Point block }
    | AcquireFailure { failure :: AcquireFailure }
    deriving (Generic, Show)

_encodeAcquireResponse
    :: forall block. ()
    => (Point block -> Json)
    -> (AcquireFailure -> Json)
    -> Wsp.Response (AcquireResponse block)
    -> Json
_encodeAcquireResponse encodePoint encodeAcquireFailure =
    Wsp.mkResponse Wsp.defaultOptions proxy $ \case
        AcquireSuccess{point} -> encodeObject
            [ ("AcquireSuccess", encodeObject
                [ ("point", encodePoint point)
                ]
              )
            ]
        AcquireFailure{failure} -> encodeObject
            [ ( "AcquireFailure", encodeObject
                [ ("failure", encodeAcquireFailure failure)
                ]
              )
            ]
  where
    proxy = Proxy @(Wsp.Request (Acquire block))

--
-- Release
--

data Release
    = Release
    deriving (Generic, Show)

_decodeRelease
    :: Json
    -> Json.Parser (Wsp.Request Release)
_decodeRelease =
    Wsp.genericFromJSON Wsp.defaultOptions

data ReleaseResponse
    = Released
    deriving (Generic, Show)

_encodeReleaseResponse
    :: Wsp.Response ReleaseResponse
    -> Json
_encodeReleaseResponse =
    Wsp.mkResponse Wsp.defaultOptions proxy $ \case
        Released -> encodeText "Released"
  where
    proxy = Proxy @(Wsp.Request Release)

--
-- Query
--

data Query block = Query { query :: SomeQuery Maybe block }
    deriving (Generic)

_decodeQuery
    :: FromJSON (SomeQuery Maybe block)
    => Json
    -> Json.Parser (Wsp.Request (Query block))
_decodeQuery =
    Wsp.genericFromJSON Wsp.defaultOptions

newtype QueryResponse block =
    QueryResponse { unQueryResponse :: Json }
    deriving (Generic)

instance Show (QueryResponse block) where
    showsPrec i (QueryResponse json) =
        T.showParen (i >= 10) (T.showString $ "QueryResponse (" <> str <> ")")
      where
        str = decodeUtf8 . jsonToByteString $ json

_encodeQueryResponse
    :: forall block. ()
    => Wsp.Response (QueryResponse block)
    -> Json
_encodeQueryResponse =
    Wsp.mkResponse Wsp.defaultOptions proxy $ \case
        QueryResponse json ->
            json
  where
    proxy = Proxy @(Wsp.Request (Query block))
