# frozen_string_literal: true
#
#   Cyberismo
#   Copyright © Cyberismo Ltd and contributors 2026
#
#   This program is free software: you can redistribute it and/or modify it under
#   the terms of the GNU Affero General Public License version 3 as published by
#   the Free Software Foundation. This program is distributed in the hope that it
#   will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
#   of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
#   See the GNU Affero General Public License for more details.
#   You should have received a copy of the GNU Affero General Public
#   License along with this program. If not, see <https://www.gnu.org/licenses/>.
#
# Loaded with `asciidoctor-pdf -r .../pdf-safe.rb`.
#
# asciidoctor's --safe-mode=secure jails `include::` and *relative* image paths to
# the base directory, but Asciidoctor::PDF::Converter#resolve_image_path returns any
# *absolute* image path verbatim and joins relative paths against an absolute
# `imagesdir` without consulting the jail. Every image-ish path in asciidoctor-pdf
# (block/inline images, the cover, background and foreground images, the title-page
# logo, admonition icons, video posters, running-content images) funnels through that
# one method, so overriding it closes the whole family.
#
# Cyberismo never needs asciidoctor-pdf to open a file: the `image` macro inlines
# attachments as data URIs before the converter runs. So the policy is:
#
#   * data URIs            -> allowed (the only legitimate image source)
#   * http(s) URLs         -> delegated, so `allow-uri-read` keeps governing them
#   * other URL schemes    -> refused (file://, ftp://, ... must never be fetched)
#   * anything under the   -> allowed (the Cyberismo theme's own logo; both the
#     PDF theme directory      title-page logo and the running header need it)
#   * every other path     -> refused with a warning naming the target
#
# This file must fail closed: if it is loaded against an asciidoctor-pdf whose
# resolve_image_path it cannot recognise, it aborts the conversion instead of
# silently leaving the hole open.

module Cyberismo
  module PdfSafe
    ABORT_PREFIX = 'cyberismo pdf-safe.rb:'

    # (node, image_path, image_format, relative_to = true) -> 3 required + 1 optional
    EXPECTED_ARITY = -4
    EXPECTED_PARAMS = [
      %i[req node],
      %i[req image_path],
      %i[req image_format],
      %i[opt relative_to],
    ].freeze

    URL_RX = %r(\A\p{Alpha}[\p{Alnum}+.-]*://).freeze

    def self.fail_closed!(reason)
      # Abort rather than convert: a no-op patch would look like it is protecting
      # the export while every absolute path still resolves.
      #
      # It must be a LoadError. Asciidoctor's CLI requires `-r` libraries inside a
      # `rescue ::SystemExit; # not permitted here` (cli/options.rb), so `exit` and
      # `abort` are swallowed and the conversion proceeds unpatched; LoadError is
      # the one exception it turns into "FAILED: ... could not be loaded" + exit 1.
      warn %(#{ABORT_PREFIX} refusing to run: #{reason})
      raise ::LoadError, %(#{ABORT_PREFIX} #{reason})
    end

    def self.verify!
      unless defined?(::Asciidoctor::PDF::Converter)
        fail_closed! 'Asciidoctor::PDF::Converter is not defined'
      end
      unless ::Asciidoctor::PDF::Converter.method_defined?(:resolve_image_path) ||
        ::Asciidoctor::PDF::Converter.private_method_defined?(:resolve_image_path)
        fail_closed! 'Asciidoctor::PDF::Converter#resolve_image_path does not exist'
      end
      meth = ::Asciidoctor::PDF::Converter.instance_method :resolve_image_path
      if meth.arity != EXPECTED_ARITY || meth.parameters != EXPECTED_PARAMS
        fail_closed! %(unexpected Asciidoctor::PDF::Converter#resolve_image_path signature ) +
          %((arity #{meth.arity}, parameters #{meth.parameters.inspect}); ) +
          %(expected arity #{EXPECTED_ARITY} with #{EXPECTED_PARAMS.inspect})
      end
      unless defined?(::Asciidoctor::Image::Base64Encoded)
        fail_closed! 'Asciidoctor::Image::Base64Encoded is not defined'
      end
    end

    # True when `path` is `dir` itself or lies below it. Both sides are expanded so
    # that `<themesdir>/../../etc/passwd` does not pass.
    def self.within?(path, dir)
      return false if path.nil? || dir.nil? || dir.to_s.empty?
      path = ::File.expand_path path.to_s
      dir = ::File.expand_path dir.to_s
      path == dir || (path.start_with? dir + ::File::SEPARATOR)
    end

    module ConverterPatch
      def resolve_image_path node, image_path, image_format, relative_to = true
        # Data URIs: the only image source a Cyberismo card legitimately produces.
        return super if ::Asciidoctor::Image::Base64Encoded === image_path

        if ::String === image_path && (::Cyberismo::PdfSafe::URL_RX.match? image_path)
          if (image_path.start_with? 'http://') || (image_path.start_with? 'https://')
            # Let asciidoctor-pdf decide; with allow-uri-read off it refuses.
            return super
          end
          log :warn, %(cyberismo: refusing image with non-http URL scheme: #{image_path})
          return nil
        end

        # super only computes a path here (no I/O), so it is safe to resolve first
        # and then decide. Keeping super in the loop preserves imagesdir semantics.
        resolved = super
        return resolved if ::Cyberismo::PdfSafe.within? resolved, @themesdir

        log :warn, %(cyberismo: refusing to read local image outside the PDF theme: #{image_path})
        nil
      end
    end
  end
end

begin
  require 'asciidoctor/pdf'
rescue ::LoadError => e
  Cyberismo::PdfSafe.fail_closed! %(cannot load asciidoctor/pdf (#{e.message}))
end

Cyberismo::PdfSafe.verify!
Asciidoctor::PDF::Converter.prepend Cyberismo::PdfSafe::ConverterPatch
